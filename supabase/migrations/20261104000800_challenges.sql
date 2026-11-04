-- Challenges: invite a friend to a game. Expires after 60 seconds; accepting creates the room.

create table public.challenges (
  id            uuid primary key default gen_random_uuid(),
  from_user     uuid not null references public.players (id) on delete cascade,
  to_user       uuid not null references public.players (id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  room_code     text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '60 seconds',
  responded_at  timestamptz,
  check (from_user <> to_user)
);
-- At most one pending challenge from a player to the same friend.
create unique index challenges_one_pending_per_pair on public.challenges (from_user, to_user) where status = 'pending';
create index challenges_to_user_idx on public.challenges (to_user, created_at desc);
create index challenges_from_user_idx on public.challenges (from_user, created_at desc);

alter table public.challenges enable row level security;
create policy "challenges: participants read"
  on public.challenges for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));
revoke all on public.challenges from anon;
revoke insert, update, delete on public.challenges from authenticated;

-- Creates a ready-to-play room for two players (same code format and first round as create_room/join_room).
create or replace function public._create_challenge_room(p_x uuid, p_o uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
  rid uuid;
begin
  for attempt in 1..10 loop
    new_code := '';
    for i in 1..5 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.rooms (code, player_x, player_o, status) values (new_code, p_x, p_o, 'playing') returning id into rid;
      insert into public.games (room_id, round, starting_turn, current_turn) values (rid, 1, 'X', 'X');
      return new_code;
    exception when unique_violation then
      -- code collision; try another
    end;
  end loop;
  raise exception 'CODE_GENERATION_FAILED';
end;
$$;

-- What the caller's app needs: the challenge plus the other player's public info (no auth ids).
create or replace function public._challenge_json(c public.challenges, me uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id,
    'direction', case when c.from_user = me then 'out' else 'in' end,
    'other', public._public_player(case when c.from_user = me then c.to_user else c.from_user end),
    'status', c.status,
    'room_code', c.room_code,
    'created_at', c.created_at,
    'expires_at', c.expires_at,
    'server_now', now()
  );
$$;

-- Marks the challenge accepted and creates the room. Caller holds the row lock.
create or replace function public._accept_challenge(c public.challenges)
returns public.challenges language plpgsql security definer set search_path = '' as $$
declare
  result public.challenges;
begin
  update public.challenges
     set status = 'accepted', room_code = public._create_challenge_room(c.from_user, c.to_user), responded_at = now()
   where id = c.id
  returning * into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- send_challenge: friends only. If they already challenged you, this accepts theirs.
-- ---------------------------------------------------------------------------
create or replace function public.send_challenge(p_handle text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target uuid := public._player_by_handle(p_handle);
  c public.challenges;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if target is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  if target = uid then raise exception 'CANNOT_CHALLENGE_SELF'; end if;
  perform public._lock_pair(uid, target);
  if not public._are_friends(uid, target) then raise exception 'NOT_FRIENDS'; end if;

  -- Pending challenges past their time are expired now, so they don't block a new one.
  update public.challenges set status = 'expired'
   where status = 'pending' and expires_at <= now()
     and ((from_user = uid and to_user = target) or (from_user = target and to_user = uid));

  select * into c from public.challenges
   where from_user = target and to_user = uid and status = 'pending' for update;
  if found then
    return public._challenge_json(public._accept_challenge(c), uid);
  end if;

  select * into c from public.challenges where from_user = uid and to_user = target and status = 'pending';
  if found then
    return public._challenge_json(c, uid);  -- already waiting: no-op
  end if;

  if (select count(*) from public.challenges
       where from_user = uid and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.challenges (from_user, to_user) values (uid, target) returning * into c;
  return public._challenge_json(c, uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- respond_challenge: the receiver accepts or declines. Never raises for a challenge that is
-- no longer pending: it returns its current state, so a double tap (or two devices) is harmless
-- and both get the same room.
-- ---------------------------------------------------------------------------
create or replace function public.respond_challenge(p_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.challenges;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into c from public.challenges where id = p_id for update;
  if not found or c.to_user <> uid then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if c.status = 'pending' and c.expires_at <= now() then
    update public.challenges set status = 'expired' where id = c.id returning * into c;
  elsif c.status = 'pending' and not p_accept then
    update public.challenges set status = 'declined', responded_at = now() where id = c.id returning * into c;
  elsif c.status = 'pending' and not public._are_friends(c.from_user, c.to_user) then
    update public.challenges set status = 'cancelled', responded_at = now() where id = c.id returning * into c;
  elsif c.status = 'pending' then
    c := public._accept_challenge(c);
  end if;
  return public._challenge_json(c, uid);
end;
$$;

-- cancel_challenge: the sender withdraws (or reports that it ran out of time).
create or replace function public.cancel_challenge(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.challenges;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into c from public.challenges where id = p_id for update;
  if not found or c.from_user <> uid then raise exception 'CHALLENGE_NOT_FOUND'; end if;
  if c.status = 'pending' then
    update public.challenges
       set status = case when expires_at <= now() then 'expired' else 'cancelled' end, responded_at = now()
     where id = c.id returning * into c;
  end if;
  return public._challenge_json(c, uid);
end;
$$;

-- Recent challenges involving me (the app shows pending ones and reacts to outcomes).
create or replace function public.get_challenges()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return coalesce((
    select jsonb_agg(public._challenge_json(c, uid) order by c.created_at desc)
      from public.challenges c
     where uid in (c.from_user, c.to_user) and c.created_at > now() - interval '10 minutes'
  ), '[]'::jsonb);
end;
$$;

-- Blocking someone cancels any pending challenges between you.
create or replace function public._cancel_challenges_on_block()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.challenges set status = 'cancelled', responded_at = now()
   where status = 'pending'
     and ((from_user = new.user_a and to_user = new.user_b) or (from_user = new.user_b and to_user = new.user_a));
  return new;
end;
$$;
create trigger friendships_block_cancels_challenges
  after update or insert on public.friendships
  for each row when (new.status = 'blocked')
  execute function public._cancel_challenges_on_block();

revoke execute on function public._create_challenge_room(uuid, uuid)          from public, anon, authenticated;
revoke execute on function public._challenge_json(public.challenges, uuid)    from public, anon, authenticated;
revoke execute on function public._accept_challenge(public.challenges)        from public, anon, authenticated;
revoke execute on function public._cancel_challenges_on_block()               from public, anon, authenticated;
revoke execute on function public.send_challenge(text)              from public, anon;
revoke execute on function public.respond_challenge(uuid, boolean)  from public, anon;
revoke execute on function public.cancel_challenge(uuid)            from public, anon;
revoke execute on function public.get_challenges()                  from public, anon;
grant  execute on function public.send_challenge(text)              to authenticated;
grant  execute on function public.respond_challenge(uuid, boolean)  to authenticated;
grant  execute on function public.cancel_challenge(uuid)            to authenticated;
grant  execute on function public.get_challenges()                  to authenticated;

alter publication supabase_realtime add table public.challenges;
