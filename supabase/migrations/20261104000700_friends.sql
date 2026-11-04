-- Friends: requests, accept/decline, unfriend, block, search, and private "last seen".
--
-- Every action goes through an RPC that checks auth.uid(). Players are addressed by their
-- public handle, never their auth id.
--
-- Rows are never deleted: "no relationship" is status 'none'. Realtime can't apply RLS to
-- DELETE events (it would broadcast the pair's ids to every subscriber), whereas an UPDATE
-- is only delivered to the two people who can see the row.

create table public.friendships (
  user_a        uuid not null references public.players (id) on delete cascade,
  user_b        uuid not null references public.players (id) on delete cascade,
  status        text not null check (status in ('pending', 'accepted', 'blocked', 'none')),
  -- Who sent the pending request, or who blocked.
  requested_by  uuid references public.players (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b),  -- one row per pair, stored in a fixed order
  check (status = 'none' or requested_by in (user_a, user_b))
);
create index friendships_user_b_idx on public.friendships (user_b);

-- Sent requests, for the 20-per-hour limit (rows above get reused, so they can't be counted).
create table public.friend_request_events (
  sender_id   uuid not null references public.players (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index friend_request_events_idx on public.friend_request_events (sender_id, created_at);

-- Kept apart from players (which past opponents can read) so only friends ever see it, via get_friends().
create table public.player_activity (
  player_id     uuid primary key references public.players (id) on delete cascade,
  last_seen_at  timestamptz not null default now()
);

alter table public.friendships enable row level security;
alter table public.friend_request_events enable row level security;
alter table public.player_activity enable row level security;

-- You see your own pairs. A block is visible only to the person who blocked.
create policy "friendships: own pairs"
  on public.friendships for select to authenticated
  using (
    (select auth.uid()) in (user_a, user_b)
    and (status <> 'blocked' or requested_by = (select auth.uid()))
  );

revoke all on public.friendships from anon;
revoke insert, update, delete on public.friendships from authenticated;
revoke all on public.friend_request_events from anon, authenticated;
revoke all on public.player_activity from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function public._player_by_handle(p_handle text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.players where handle = lower(btrim(coalesce(p_handle, '')));
$$;

create or replace function public._friendship(a uuid, b uuid)
returns public.friendships language sql stable security definer set search_path = '' as $$
  select * from public.friendships where user_a = least(a, b) and user_b = greatest(a, b);
$$;

create or replace function public._is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships
                  where user_a = least(a, b) and user_b = greatest(a, b) and status = 'blocked');
$$;

create or replace function public._are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships
                  where user_a = least(a, b) and user_b = greatest(a, b) and status = 'accepted');
$$;

-- Serialises everything that touches one pair (e.g. both people sending a request at once).
create or replace function public._lock_pair(a uuid, b uuid)
returns void language sql volatile security definer set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended(least(a, b)::text || greatest(a, b)::text, 0));
$$;

-- The relationship as `me` sees it: self | friends | requested | incoming | blocked | none.
create or replace function public._relation(me uuid, other uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when me = other then 'self'
    when f.status = 'accepted' then 'friends'
    when f.status = 'pending' and f.requested_by = me then 'requested'
    when f.status = 'pending' then 'incoming'
    when f.status = 'blocked' and f.requested_by = me then 'blocked'
    else 'none'  -- includes "they blocked me": never revealed
  end
  from (select 1) _ left join public.friendships f on f.user_a = least(me, other) and f.user_b = greatest(me, other);
$$;

-- Writes the pair's row (insert or update), keeping user_a < user_b.
create or replace function public._set_friendship(a uuid, b uuid, p_status text, p_by uuid)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.friendships (user_a, user_b, status, requested_by)
  values (least(a, b), greatest(a, b), p_status, p_by)
  on conflict (user_a, user_b) do update
    set status = excluded.status, requested_by = excluded.requested_by, updated_at = now();
$$;

-- ---------------------------------------------------------------------------
-- Actions. Each returns the new relation from the caller's side.
-- ---------------------------------------------------------------------------
create or replace function public.send_friend_request(p_handle text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target uuid := public._player_by_handle(p_handle);
  f public.friendships;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if target is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  if target = uid then raise exception 'CANNOT_FRIEND_SELF'; end if;
  perform public._lock_pair(uid, target);

  f := public._friendship(uid, target);
  if f.status = 'blocked' then
    raise exception 'BLOCKED';  -- same error whichever side blocked
  elsif f.status = 'accepted' then
    return 'friends';
  elsif f.status = 'pending' and f.requested_by = uid then
    return 'requested';  -- already sent: no-op
  elsif f.status = 'pending' then
    perform public._set_friendship(uid, target, 'accepted', f.requested_by);  -- they asked me too: friends
    return 'friends';
  end if;

  if (select count(*) from public.friend_request_events
       where sender_id = uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'RATE_LIMITED';
  end if;
  insert into public.friend_request_events (sender_id) values (uid);
  perform public._set_friendship(uid, target, 'pending', uid);
  return 'requested';
end;
$$;

create or replace function public.respond_friend_request(p_handle text, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target uuid := public._player_by_handle(p_handle);
  f public.friendships;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if target is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  perform public._lock_pair(uid, target);
  f := public._friendship(uid, target);
  -- Only the receiver can answer; you can't accept your own request.
  if f.status is distinct from 'pending' or f.requested_by is distinct from target then
    raise exception 'NO_PENDING_REQUEST';
  end if;
  if p_accept then
    perform public._set_friendship(uid, target, 'accepted', target);
    return 'friends';
  end if;
  perform public._set_friendship(uid, target, 'none', null);
  return 'none';
end;
$$;

create or replace function public.cancel_friend_request(p_handle text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target uuid := public._player_by_handle(p_handle);
  f public.friendships;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if target is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  perform public._lock_pair(uid, target);
  f := public._friendship(uid, target);
  if f.status is distinct from 'pending' or f.requested_by is distinct from uid then
    raise exception 'NO_PENDING_REQUEST';
  end if;
  perform public._set_friendship(uid, target, 'none', null);
  return 'none';
end;
$$;

create or replace function public.remove_friend(p_handle text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target uuid := public._player_by_handle(p_handle);
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if target is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  perform public._lock_pair(uid, target);
  if not public._are_friends(uid, target) then raise exception 'NOT_FRIENDS'; end if;
  perform public._set_friendship(uid, target, 'none', null);
  return 'none';
end;
$$;

create or replace function public.block_user(p_handle text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target uuid := public._player_by_handle(p_handle);
  f public.friendships;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if target is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  if target = uid then raise exception 'CANNOT_FRIEND_SELF'; end if;
  perform public._lock_pair(uid, target);
  f := public._friendship(uid, target);
  -- If they already blocked me, keep their block (one row per pair); either way we're cut off.
  if f.status is distinct from 'blocked' then
    perform public._set_friendship(uid, target, 'blocked', uid);
  end if;
  return 'blocked';
end;
$$;

create or replace function public.unblock_user(p_handle text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target uuid := public._player_by_handle(p_handle);
  f public.friendships;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if target is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  perform public._lock_pair(uid, target);
  f := public._friendship(uid, target);
  if f.status = 'blocked' and f.requested_by = uid then
    perform public._set_friendship(uid, target, 'none', null);
  end if;
  return public._relation(uid, target);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

-- Everything the Friends page needs. last_seen_at is only ever returned for accepted friends.
create or replace function public.get_friends()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return (
    with mine as (
      select case when f.user_a = uid then f.user_b else f.user_a end as other, f.*
        from public.friendships f
       where uid in (f.user_a, f.user_b) and f.status <> 'none'
         and (f.status <> 'blocked' or f.requested_by = uid)
    )
    select jsonb_build_object(
      'friends', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'player', public._public_player(m.other),
                 'since', m.updated_at,
                 'last_seen_at', a.last_seen_at,
                 'head_to_head', public._head_to_head(uid, m.other)
               ) order by m.updated_at desc)
          from mine m left join public.player_activity a on a.player_id = m.other
         where m.status = 'accepted'), '[]'::jsonb),
      'incoming', coalesce((
        select jsonb_agg(jsonb_build_object('player', public._public_player(m.other), 'at', m.updated_at) order by m.updated_at desc)
          from mine m where m.status = 'pending' and m.requested_by = m.other), '[]'::jsonb),
      'outgoing', coalesce((
        select jsonb_agg(jsonb_build_object('player', public._public_player(m.other), 'at', m.updated_at) order by m.updated_at desc)
          from mine m where m.status = 'pending' and m.requested_by = uid), '[]'::jsonb),
      'blocked', coalesce((
        select jsonb_agg(jsonb_build_object('player', public._public_player(m.other), 'at', m.updated_at) order by m.updated_at desc)
          from mine m where m.status = 'blocked'), '[]'::jsonb)
    )
  );
end;
$$;

-- Find players by name prefix or exact handle (friend code). Hides anyone who blocked you.
create or replace function public.search_players(p_query text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  q text := btrim(coalesce(p_query, ''));
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  q := left(q, 24);
  return coalesce((
    select jsonb_agg(jsonb_build_object('player', public._public_player(p.id), 'relation', public._relation(uid, p.id)))
      from (
        select p.id from public.players p
         where p.id <> uid
           and (p.handle = lower(q)
                or p.name ilike replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
           and not exists (select 1 from public.friendships f
                            where f.user_a = least(uid, p.id) and f.user_b = greatest(uid, p.id)
                              and f.status = 'blocked' and f.requested_by = p.id)
         order by (p.handle = lower(q)) desc, p.name
         limit 10
      ) p
  ), '[]'::jsonb);
end;
$$;

-- Heartbeat while the app is open (and once when it's closed) for "last seen 5m ago".
create or replace function public.touch_last_seen()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  insert into public.player_activity (player_id, last_seen_at) values (auth.uid(), now())
  on conflict (player_id) do update set last_seen_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Chat: blocked users can't message each other.
-- send_message is defined in 0006; this replaces it with the same body plus a block check.
-- ---------------------------------------------------------------------------
create or replace function public.send_message(p_room_id uuid, p_body text, p_client_id uuid)
returns public.room_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.rooms;
  clean text;
  result public.room_messages;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_client_id is null then
    raise exception 'INVALID_MESSAGE';
  end if;

  select * into r from public.rooms where id = p_room_id for update;
  if not found or uid not in (r.player_x, coalesce(r.player_o, r.player_x)) then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into result from public.room_messages where sender_id = uid and client_id = p_client_id;
  if found then
    return result;
  end if;

  if r.status = 'abandoned' then
    raise exception 'ROOM_CLOSED';
  end if;
  if r.player_o is not null and public._is_blocked(r.player_x, r.player_o) then
    raise exception 'BLOCKED';
  end if;

  clean := btrim(regexp_replace(regexp_replace(coalesce(p_body, ''), '[\x00-\x1F\x7F]', ' ', 'g'), '\s+', ' ', 'g'));
  if clean = '' then
    raise exception 'MESSAGE_EMPTY';
  end if;
  if char_length(clean) > 200 then
    raise exception 'MESSAGE_TOO_LONG';
  end if;

  if (select count(*) from public.room_messages
       where sender_id = uid and room_id = r.id and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.room_messages (room_id, sender_id, body, client_id)
  values (r.id, uid, clean, p_client_id)
  returning * into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public._player_by_handle(text)                  from public, anon, authenticated;
revoke execute on function public._friendship(uuid, uuid)                   from public, anon, authenticated;
revoke execute on function public._is_blocked(uuid, uuid)                   from public, anon, authenticated;
revoke execute on function public._are_friends(uuid, uuid)                  from public, anon, authenticated;
revoke execute on function public._lock_pair(uuid, uuid)                    from public, anon, authenticated;
revoke execute on function public._relation(uuid, uuid)                     from public, anon, authenticated;
revoke execute on function public._set_friendship(uuid, uuid, text, uuid)   from public, anon, authenticated;

revoke execute on function public.send_friend_request(text)             from public, anon;
revoke execute on function public.respond_friend_request(text, boolean) from public, anon;
revoke execute on function public.cancel_friend_request(text)           from public, anon;
revoke execute on function public.remove_friend(text)                   from public, anon;
revoke execute on function public.block_user(text)                      from public, anon;
revoke execute on function public.unblock_user(text)                    from public, anon;
revoke execute on function public.get_friends()                         from public, anon;
revoke execute on function public.search_players(text)                  from public, anon;
revoke execute on function public.touch_last_seen()                     from public, anon;
grant  execute on function public.send_friend_request(text)             to authenticated;
grant  execute on function public.respond_friend_request(text, boolean) to authenticated;
grant  execute on function public.cancel_friend_request(text)           to authenticated;
grant  execute on function public.remove_friend(text)                   to authenticated;
grant  execute on function public.block_user(text)                      to authenticated;
grant  execute on function public.unblock_user(text)                    to authenticated;
grant  execute on function public.get_friends()                         to authenticated;
grant  execute on function public.search_players(text)                  to authenticated;
grant  execute on function public.touch_last_seen()                     to authenticated;

alter publication supabase_realtime add table public.friendships;
