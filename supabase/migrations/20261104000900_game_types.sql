-- Stage 1 of Couple Challenge: rooms (and challenges) know which game they are for.
--
-- Backwards compatible by design:
--   * rooms.game_type defaults to 'tictactoe', so every existing room stays valid.
--   * join_room keeps its exact name, argument and return type; it only skips creating a
--     Tic-Tac-Toe round when the room is a Couple Challenge room. Old app versions still work.
--   * create_room() is untouched (still creates Tic-Tac-Toe rooms).
--   * send_challenge gains an optional p_game_type (default 'tictactoe'), so calls that only
--     pass p_handle (older clients) behave exactly as before.

alter table public.rooms
  add column game_type text not null default 'tictactoe'
  check (game_type in ('tictactoe', 'couple'));

alter table public.challenges
  add column game_type text not null default 'tictactoe'
  check (game_type in ('tictactoe', 'couple'));

-- ---------------------------------------------------------------------------
-- create_room_for: like create_room(), for either game.
-- ---------------------------------------------------------------------------
create or replace function public.create_room_for(p_game_type text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
  result public.rooms;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_game_type is null or p_game_type not in ('tictactoe', 'couple') then
    raise exception 'INVALID_GAME_TYPE';
  end if;
  if not exists (select 1 from public.players where id = uid) then
    raise exception 'NO_PROFILE';
  end if;

  for attempt in 1..10 loop
    new_code := '';
    for i in 1..5 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.rooms (code, player_x, game_type) values (new_code, uid, p_game_type) returning * into result;
      return result;
    exception when unique_violation then
      -- code collision; try another
    end;
  end loop;

  raise exception 'CODE_GENERATION_FAILED';
end;
$$;

-- ---------------------------------------------------------------------------
-- join_room: same as 0003, plus: the first Tic-Tac-Toe round is only created for
-- Tic-Tac-Toe rooms. (Couple rooms start their sessions from the lobby.)
-- ---------------------------------------------------------------------------
create or replace function public.join_room(p_code text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.rooms;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into r from public.rooms where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if uid = r.player_x or uid = r.player_o then
    return r;
  end if;
  if r.status = 'abandoned' then
    raise exception 'ROOM_CLOSED';
  end if;
  if r.player_o is not null then
    raise exception 'ROOM_FULL';
  end if;
  if not exists (select 1 from public.players where id = uid) then
    raise exception 'NO_PROFILE';
  end if;

  update public.rooms
     set player_o = uid, status = 'playing', updated_at = now()
   where id = r.id
  returning * into r;

  if r.game_type = 'tictactoe' then
    insert into public.games (room_id, round, starting_turn, current_turn)
    values (r.id, 1, 'X', 'X');
  end if;

  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_room_invite: + game_type, so links and the join box open the right game.
-- ---------------------------------------------------------------------------
create or replace function public.get_room_invite(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'host', public._public_player(r.player_x),
           'status', r.status,
           'is_full', r.player_o is not null,
           'game_type', r.game_type
         )
    from public.rooms r
   where r.code = upper(btrim(p_code));
$$;

-- ---------------------------------------------------------------------------
-- Challenges: pick the game.
-- ---------------------------------------------------------------------------
create or replace function public._create_game_room(p_x uuid, p_o uuid, p_game_type text)
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
      insert into public.rooms (code, player_x, player_o, status, game_type)
      values (new_code, p_x, p_o, 'playing', p_game_type) returning id into rid;
      if p_game_type = 'tictactoe' then
        insert into public.games (room_id, round, starting_turn, current_turn) values (rid, 1, 'X', 'X');
      end if;
      return new_code;
    exception when unique_violation then
      -- code collision; try another
    end;
  end loop;
  raise exception 'CODE_GENERATION_FAILED';
end;
$$;

-- Same as 0008, but the room is created for the challenge's game.
create or replace function public._accept_challenge(c public.challenges)
returns public.challenges language plpgsql security definer set search_path = '' as $$
declare
  result public.challenges;
begin
  update public.challenges
     set status = 'accepted', room_code = public._create_game_room(c.from_user, c.to_user, c.game_type), responded_at = now()
   where id = c.id
  returning * into result;
  return result;
end;
$$;

-- Same as 0008, plus game_type.
create or replace function public._challenge_json(c public.challenges, me uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id,
    'direction', case when c.from_user = me then 'out' else 'in' end,
    'other', public._public_player(case when c.from_user = me then c.to_user else c.from_user end),
    'status', c.status,
    'game_type', c.game_type,
    'room_code', c.room_code,
    'created_at', c.created_at,
    'expires_at', c.expires_at,
    'server_now', now()
  );
$$;

-- The one-argument version is replaced by one with an optional game (default Tic-Tac-Toe),
-- so existing callers that only send p_handle keep working.
drop function public.send_challenge(text);
create function public.send_challenge(p_handle text, p_game_type text default 'tictactoe')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target uuid := public._player_by_handle(p_handle);
  c public.challenges;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_game_type is null or p_game_type not in ('tictactoe', 'couple') then raise exception 'INVALID_GAME_TYPE'; end if;
  if target is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  if target = uid then raise exception 'CANNOT_CHALLENGE_SELF'; end if;
  perform public._lock_pair(uid, target);
  if not public._are_friends(uid, target) then raise exception 'NOT_FRIENDS'; end if;

  update public.challenges set status = 'expired'
   where status = 'pending' and expires_at <= now()
     and ((from_user = uid and to_user = target) or (from_user = target and to_user = uid));

  -- They already challenged me: accept theirs (their choice of game wins).
  select * into c from public.challenges
   where from_user = target and to_user = uid and status = 'pending' for update;
  if found then
    return public._challenge_json(public._accept_challenge(c), uid);
  end if;

  select * into c from public.challenges where from_user = uid and to_user = target and status = 'pending';
  if found then
    return public._challenge_json(c, uid);
  end if;

  if (select count(*) from public.challenges
       where from_user = uid and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.challenges (from_user, to_user, game_type) values (uid, target, p_game_type) returning * into c;
  return public._challenge_json(c, uid);
end;
$$;

revoke execute on function public._create_game_room(uuid, uuid, text)   from public, anon, authenticated;
revoke execute on function public.create_room_for(text)                 from public, anon;
grant  execute on function public.create_room_for(text)                 to authenticated;
revoke execute on function public.send_challenge(text, text)            from public, anon;
grant  execute on function public.send_challenge(text, text)            to authenticated;
