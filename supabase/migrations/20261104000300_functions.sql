-- Game API. Every state change happens here, checked against auth.uid().
-- Errors are raised as short codes (e.g. 'ROOM_FULL') that the client maps to friendly messages.

-- ---------------------------------------------------------------------------
-- create_room: the caller becomes X and waits for a friend.
-- ---------------------------------------------------------------------------
create or replace function public.create_room()
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
  if not exists (select 1 from public.players where id = uid) then
    raise exception 'NO_PROFILE';
  end if;

  for attempt in 1..10 loop
    new_code := '';
    for i in 1..5 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.rooms (code, player_x) values (new_code, uid) returning * into result;
      return result;
    exception when unique_violation then
      -- code collision; try another
    end;
  end loop;

  raise exception 'CODE_GENERATION_FAILED';
end;
$$;

-- ---------------------------------------------------------------------------
-- join_room: idempotent for existing members (this is how a refresh restores
-- the room). A newcomer takes the O seat and round 1 starts. A third person
-- gets ROOM_FULL.
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

  insert into public.games (room_id, round, starting_turn, current_turn)
  values (r.id, 1, 'X', 'X');

  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- make_move: locks the game row so concurrent taps are serialized, then
-- validates seat, turn, status and cell before applying the move and
-- resolving win/draw.
-- ---------------------------------------------------------------------------
create or replace function public.make_move(p_game_id uuid, p_cell int)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  lines constant smallint[] := '{{0,1,2},{3,4,5},{6,7,8},{0,3,6},{1,4,7},{2,5,8},{0,4,8},{2,4,6}}';
  line smallint[];
  won smallint[];
  g public.games;
  r public.rooms;
  mark text;
  b text;
  is_over boolean;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_cell is null or p_cell < 0 or p_cell > 8 then
    raise exception 'INVALID_CELL';
  end if;

  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;

  select * into r from public.rooms where id = g.room_id;
  mark := case uid when r.player_x then 'X' when r.player_o then 'O' end;
  if mark is null then
    raise exception 'GAME_NOT_FOUND'; -- don't reveal games to non-members
  end if;
  if g.status <> 'playing' then
    raise exception 'GAME_NOT_PLAYING';
  end if;
  if r.status <> 'playing' then
    raise exception 'ROOM_NOT_ACTIVE';
  end if;
  if g.current_turn is distinct from mark then
    raise exception 'NOT_YOUR_TURN';
  end if;
  if substr(g.board, p_cell + 1, 1) <> '.' then
    raise exception 'CELL_TAKEN';
  end if;

  b := overlay(g.board placing mark from p_cell + 1 for 1);

  foreach line slice 1 in array lines loop
    if substr(b, line[1] + 1, 1) = mark
       and substr(b, line[2] + 1, 1) = mark
       and substr(b, line[3] + 1, 1) = mark then
      won := line;
      exit;
    end if;
  end loop;

  is_over := won is not null or position('.' in b) = 0;

  update public.games set
    board        = b,
    moves        = moves || jsonb_build_array(jsonb_build_object('cell', p_cell, 'mark', mark, 'at', now())),
    current_turn = case when is_over then null when mark = 'X' then 'O' else 'X' end,
    status       = case when is_over then 'finished' else 'playing' end,
    winner       = case when won is not null then mark when is_over then 'draw' end,
    winning_line = won,
    ended_at     = case when is_over then now() end
  where id = g.id
  returning * into g;

  return g;
end;
$$;

-- ---------------------------------------------------------------------------
-- request_rematch: starts the next round once the current one is over.
-- The starting mark alternates each round. Idempotent: if both players tap
-- Rematch, the second call just returns the round the first one created.
-- ---------------------------------------------------------------------------
create or replace function public.request_rematch(p_room_id uuid)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.rooms;
  g public.games;
  next_start text;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into r from public.rooms where id = p_room_id for update;
  if not found or uid not in (r.player_x, coalesce(r.player_o, r.player_x)) then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if r.status <> 'playing' then
    raise exception 'ROOM_NOT_ACTIVE';
  end if;

  select * into g from public.games where room_id = r.id order by round desc limit 1;
  if found and g.status = 'playing' then
    return g;
  end if;

  next_start := case when g.starting_turn = 'X' then 'O' else 'X' end;

  insert into public.games (room_id, round, starting_turn, current_turn)
  values (r.id, coalesce(g.round, 0) + 1, next_start, next_start)
  returning * into g;

  return g;
end;
$$;

-- ---------------------------------------------------------------------------
-- leave_room: explicit "Leave game". Closes the room and any live round.
-- ---------------------------------------------------------------------------
create or replace function public.leave_room(p_room_id uuid)
returns void
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

  select * into r from public.rooms where id = p_room_id for update;
  if not found or uid not in (r.player_x, coalesce(r.player_o, r.player_x)) then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if r.status = 'abandoned' then
    return;
  end if;

  update public.rooms set status = 'abandoned', updated_at = now() where id = r.id;
  update public.games
     set status = 'abandoned', current_turn = null, ended_at = now()
   where room_id = r.id and status = 'playing';
end;
$$;

-- Only signed-in users (anonymous sign-ins count) may call the API.
revoke execute on function public.create_room()               from public, anon;
revoke execute on function public.join_room(text)             from public, anon;
revoke execute on function public.make_move(uuid, int)        from public, anon;
revoke execute on function public.request_rematch(uuid)       from public, anon;
revoke execute on function public.leave_room(uuid)            from public, anon;
grant  execute on function public.create_room()               to authenticated;
grant  execute on function public.join_room(text)             to authenticated;
grant  execute on function public.make_move(uuid, int)        to authenticated;
grant  execute on function public.request_rematch(uuid)       to authenticated;
grant  execute on function public.leave_room(uuid)            to authenticated;
