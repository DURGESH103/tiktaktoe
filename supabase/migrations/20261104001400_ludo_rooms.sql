-- Ludo, stage 1: rooms for 2–4 players (room_players), the lobby (seats, ready, options),
-- invites into a lobby, and game-type isolation.
--
-- Ludo rooms use rooms.game_type = 'ludo', rooms.player_x = the host, and NEVER player_o.
-- Every seat (host included) lives in room_players, which only Ludo uses.
-- Tic-Tac-Toe and Couple Challenge keep their tables and behaviour: functions replaced below
-- are copied verbatim from earlier migrations with only a Ludo branch or a game-type guard added.

-- ---------------------------------------------------------------------------
-- Game types
-- ---------------------------------------------------------------------------
alter table public.rooms drop constraint rooms_game_type_check;
alter table public.rooms add constraint rooms_game_type_check check (game_type in ('tictactoe', 'couple', 'ludo'));
alter table public.challenges drop constraint challenges_game_type_check;
alter table public.challenges add constraint challenges_game_type_check check (game_type in ('tictactoe', 'couple', 'ludo'));

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.ludo_rooms (
  room_id      uuid primary key references public.rooms (id) on delete cascade,
  max_players  smallint not null default 4 check (max_players between 2 and 4),
  -- quick: every player starts with one token already out.
  mode         text not null default 'classic' check (mode in ('classic', 'quick')),
  created_at   timestamptz not null default now()
);

create table public.room_players (
  room_id    uuid not null references public.rooms (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  seat       smallint not null check (seat between 0 and 3),
  color      text generated always as (case seat when 0 then 'red' when 1 then 'green' when 2 then 'yellow' else 'blue' end) stored,
  ready      boolean not null default false,
  joined_at  timestamptz not null default now(),
  -- Leaving keeps the row (no DELETE: realtime can't apply RLS to deletes); the seat frees up.
  left_at    timestamptz,
  primary key (room_id, player_id)
);
create unique index room_players_one_per_seat on public.room_players (room_id, seat) where left_at is null;
create index room_players_player_idx on public.room_players (player_id);

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer, so RLS policies can use them without recursion)
-- ---------------------------------------------------------------------------

-- Seats used for a table size: 2 players sit opposite (red/yellow), 3 take red/green/yellow.
create or replace function public._ludo_allowed_seats(p_max smallint)
returns smallint[] language sql immutable set search_path = '' as $$
  select case p_max when 2 then '{0,2}'::smallint[] when 3 then '{0,1,2}'::smallint[] else '{0,1,2,3}'::smallint[] end;
$$;

-- Is the caller in this room? (player_x/player_o for 2-player games, an active seat for Ludo)
create or replace function public._is_room_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.rooms r where r.id = p_room_id and auth.uid() in (r.player_x, r.player_o))
    or exists (select 1 from public.room_players rp where rp.room_id = p_room_id and rp.player_id = auth.uid() and rp.left_at is null)
  );
$$;

-- Has the caller shared a Ludo table with this player? (so names/avatars show in the lobby)
create or replace function public._shares_room_with(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.room_players me
      join public.room_players them on them.room_id = me.room_id
     where me.player_id = auth.uid() and them.player_id = p_other
  );
$$;

-- Creates the Ludo settings and seats for a new room: the host in seat 0 (always ready), and
-- optionally an invited guest in seat 2 (opposite).
create or replace function public._ludo_setup(p_room_id uuid, p_host uuid, p_guest uuid, p_max smallint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ludo_rooms (room_id, max_players) values (p_room_id, p_max);
  insert into public.room_players (room_id, player_id, seat, ready) values (p_room_id, p_host, 0, true);
  if p_guest is not null then
    insert into public.room_players (room_id, player_id, seat, ready) values (p_room_id, p_guest, 2, false);
  end if;
end;
$$;

-- Seats a player in a waiting Ludo room (caller holds the room row lock).
create or replace function public._ludo_take_seat(r public.rooms, p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  lr public.ludo_rooms;
  free smallint;
begin
  if exists (select 1 from public.room_players where room_id = r.id and player_id = p_uid and left_at is null) then
    return;
  end if;
  if r.status = 'abandoned' then raise exception 'ROOM_CLOSED'; end if;
  if r.status <> 'waiting' then raise exception 'GAME_STARTED'; end if;
  if exists (select 1 from public.room_players rp
              where rp.room_id = r.id and rp.left_at is null and public._is_blocked(rp.player_id, p_uid)) then
    raise exception 'BLOCKED';
  end if;
  select * into lr from public.ludo_rooms where room_id = r.id;
  select s into free
    from unnest(public._ludo_allowed_seats(lr.max_players)) s
   where not exists (select 1 from public.room_players rp where rp.room_id = r.id and rp.seat = s and rp.left_at is null)
   order by s limit 1;
  if free is null then raise exception 'ROOM_FULL'; end if;

  insert into public.room_players (room_id, player_id, seat, ready)
  values (r.id, p_uid, free, false)
  on conflict (room_id, player_id) do update
    set seat = excluded.seat, ready = false, left_at = null, joined_at = now();
  update public.rooms set updated_at = now() where id = r.id;
end;
$$;

-- Leaving a Ludo room. In the lobby the host closes the room; others just free their seat.
-- (Leaving a game in progress = last place, added with the game rules.)
create or replace function public._ludo_leave(r public.rooms, p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.room_players where room_id = r.id and player_id = p_uid and left_at is null) then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if r.status = 'abandoned' then return; end if;
  if r.status = 'waiting' and p_uid = r.player_x then
    update public.rooms set status = 'abandoned', updated_at = now() where id = r.id;
    return;
  end if;
  update public.room_players set left_at = now(), ready = false where room_id = r.id and player_id = p_uid;
  update public.rooms set updated_at = now() where id = r.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS (additive policies: the existing 2-player policies are unchanged)
-- ---------------------------------------------------------------------------
alter table public.ludo_rooms enable row level security;
alter table public.room_players enable row level security;

create policy "room_players: room members read" on public.room_players
  for select to authenticated using (public._is_room_member(room_id));
create policy "ludo_rooms: room members read" on public.ludo_rooms
  for select to authenticated using (public._is_room_member(room_id));
create policy "rooms: ludo seat holders read" on public.rooms
  for select to authenticated using (game_type = 'ludo' and public._is_room_member(id));
create policy "players: read ludo tablemates" on public.players
  for select to authenticated using (public._shares_room_with(id));

revoke all on public.ludo_rooms, public.room_players from anon;
revoke insert, update, delete on public.ludo_rooms, public.room_players from authenticated;

-- ---------------------------------------------------------------------------
-- Lobby actions
-- ---------------------------------------------------------------------------

-- Host: table size (2–4) and Classic/Quick. Seats are re-packed in join order (host stays red)
-- and everyone else has to press Ready again, since the settings changed.
create or replace function public.set_ludo_options(p_room_id uuid, p_max_players int, p_mode text)
returns public.ludo_rooms language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  lr public.ludo_rooms;
  seats smallint[];
  ids uuid[];
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into r from public.rooms where id = p_room_id for update;
  if not found or r.game_type <> 'ludo' or not exists (
    select 1 from public.room_players where room_id = r.id and player_id = auth.uid() and left_at is null) then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if auth.uid() <> r.player_x then raise exception 'NOT_HOST'; end if;
  if r.status <> 'waiting' then raise exception 'GAME_STARTED'; end if;
  if p_max_players is null or p_max_players not between 2 and 4 or p_mode is null or p_mode not in ('classic', 'quick') then
    raise exception 'INVALID_OPTIONS';
  end if;
  if (select count(*) from public.room_players where room_id = r.id and left_at is null) > p_max_players then
    raise exception 'TOO_MANY_PLAYERS';
  end if;

  update public.ludo_rooms set max_players = p_max_players, mode = p_mode where room_id = r.id returning * into lr;

  -- Re-pack seats: park everyone (frees the unique seat index), then seat them in join order.
  seats := public._ludo_allowed_seats(p_max_players::smallint);
  select array_agg(player_id order by (player_id = r.player_x) desc, joined_at) into ids
    from public.room_players where room_id = r.id and left_at is null;
  update public.room_players set left_at = now() where room_id = r.id and left_at is null;
  for i in 1 .. coalesce(cardinality(ids), 0) loop
    update public.room_players
       set seat = seats[i], left_at = null, ready = (ids[i] = r.player_x)
     where room_id = r.id and player_id = ids[i];
  end loop;
  update public.rooms set updated_at = now() where id = r.id;
  return lr;
end;
$$;

-- Ready / not ready (the host is always ready: their "ready" is pressing Start).
create or replace function public.set_ludo_ready(p_room_id uuid, p_ready boolean)
returns public.room_players language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  rp public.room_players;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into r from public.rooms where id = p_room_id for update;
  if not found or r.game_type <> 'ludo' then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into rp from public.room_players where room_id = r.id and player_id = auth.uid() and left_at is null;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if r.status <> 'waiting' then raise exception 'GAME_STARTED'; end if;
  update public.room_players
     set ready = (auth.uid() = r.player_x) or coalesce(p_ready, false)
   where room_id = r.id and player_id = auth.uid()
  returning * into rp;
  return rp;
end;
$$;

-- Link previews and the universal join box: adds seat counts for Ludo rooms
-- (2-player rooms return exactly what they did before).
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
           'is_full', case when r.game_type = 'ludo' then n.players >= lr.max_players else r.player_o is not null end,
           'game_type', r.game_type
         )
         || case when r.game_type = 'ludo'
                 then jsonb_build_object('players', n.players, 'max_players', lr.max_players, 'mode', lr.mode)
                 else '{}'::jsonb end
    from public.rooms r
    left join public.ludo_rooms lr on lr.room_id = r.id
    cross join lateral (select count(*)::int as players from public.room_players rp
                         where rp.room_id = r.id and rp.left_at is null) n
   where r.code = upper(btrim(p_code));
$$;

-- ---------------------------------------------------------------------------
-- Existing functions, copied verbatim with a Ludo branch / game-type guard added
-- (each change is marked "added in 0014").
-- ---------------------------------------------------------------------------

-- Tic-Tac-Toe moves only touch Tic-Tac-Toe rooms.
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
  if r.game_type <> 'tictactoe' then
    raise exception 'GAME_NOT_FOUND'; -- Tic-Tac-Toe rounds only (added in 0014)
  end if;
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

-- Rematch only makes sense in Tic-Tac-Toe rooms (before 0014, calling it on a Couple room
-- through the API could have created a stray Tic-Tac-Toe round there).
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
  if r.game_type <> 'tictactoe' then
    raise exception 'ROOM_NOT_FOUND'; -- only Tic-Tac-Toe rooms have rounds (added in 0014)
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

-- Leaving a Ludo room frees the seat (or closes the lobby for the host).
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
  if found and r.game_type = 'ludo' then
    perform public._ludo_leave(r, uid); -- added in 0014
    return;
  end if;
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

-- Tic-Tac-Toe results (stats, head-to-head, profiles, friends) filter by game type explicitly.
create or replace function public._player_results(p_player uuid)
returns table (game_id uuid, opponent uuid, result text, ended_at timestamptz, round int, moves int)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id,
         case when r.player_x = p_player then r.player_o else r.player_x end,
         case
           when g.winner = 'draw' then 'draw'
           when (g.winner = 'X') = (r.player_x = p_player) then 'win'
           else 'loss'
         end,
         coalesce(g.ended_at, g.started_at),
         g.round,
         jsonb_array_length(g.moves)
    from public.games g
    join public.rooms r on r.id = g.room_id
   where g.status = 'finished'
     and g.winner is not null
     and r.game_type = 'tictactoe' -- added in 0014: never count other games' rooms
     and p_player in (r.player_x, r.player_o);
$$;

-- Joining a Ludo room takes a seat; other games are unchanged.
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

  -- Ludo (added in 0014): seats live in room_players; player_o is never used.
  if r.game_type = 'ludo' then
    if exists (select 1 from public.room_players where room_id = r.id and player_id = uid and left_at is null) then
      return r;
    end if;
    if r.status = 'abandoned' then
      raise exception 'ROOM_CLOSED';
    end if;
    if not exists (select 1 from public.players where id = uid) then
      raise exception 'NO_PROFILE';
    end if;
    perform public._ludo_take_seat(r, uid);
    return r;
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

-- create_room_for('ludo') makes a lobby with the host in the red seat.
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
  if p_game_type is null or p_game_type not in ('tictactoe', 'couple', 'ludo') then
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
      if p_game_type = 'ludo' then
        perform public._ludo_setup(result.id, uid, null, 4::smallint); -- added in 0014
      end if;
      return result;
    exception when unique_violation then
      -- code collision; try another
    end;
  end loop;

  raise exception 'CODE_GENERATION_FAILED';
end;
$$;

-- Accepting a friend's Ludo challenge (without a lobby) opens a 2-player lobby.
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
      values (new_code, p_x,
              case when p_game_type = 'ludo' then null else p_o end,         -- Ludo: seats are in room_players (0014)
              case when p_game_type = 'ludo' then 'waiting' else 'playing' end, -- Ludo starts in the lobby
              p_game_type) returning id into rid;
      if p_game_type = 'tictactoe' then
        insert into public.games (room_id, round, starting_turn, current_turn) values (rid, 1, 'X', 'X');
      elsif p_game_type = 'ludo' then
        perform public._ludo_setup(rid, p_x, p_o, 2::smallint);
      end if;
      return new_code;
    exception when unique_violation then
      -- code collision; try another
    end;
  end loop;
  raise exception 'CODE_GENERATION_FAILED';
end;
$$;

-- ---------------------------------------------------------------------------
-- Challenges: Ludo invites. send_challenge gains an optional p_room_code (default null), so
-- existing calls (handle) and (handle, game_type) behave exactly as before. With a room code,
-- the friend is invited into that Ludo lobby (the host can invite several friends at once).
-- ---------------------------------------------------------------------------
drop function public.send_challenge(text, text);
create function public.send_challenge(p_handle text, p_game_type text default 'tictactoe', p_room_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target uuid := public._player_by_handle(p_handle);
  c public.challenges;
  r public.rooms;
  v_code text := upper(btrim(p_room_code));
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_game_type is null or p_game_type not in ('tictactoe', 'couple', 'ludo') then raise exception 'INVALID_GAME_TYPE'; end if;
  if target is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  if target = uid then raise exception 'CANNOT_CHALLENGE_SELF'; end if;
  perform public._lock_pair(uid, target);
  if not public._are_friends(uid, target) then raise exception 'NOT_FRIENDS'; end if;

  if v_code is not null then
    if p_game_type <> 'ludo' then raise exception 'INVALID_GAME_TYPE'; end if;
    select * into r from public.rooms where code = v_code and game_type = 'ludo';
    if not found or not exists (select 1 from public.room_players where room_id = r.id and player_id = uid and left_at is null) then
      raise exception 'ROOM_NOT_FOUND';
    end if;
    if r.status <> 'waiting' then raise exception 'GAME_STARTED'; end if;
    if exists (select 1 from public.room_players where room_id = r.id and player_id = target and left_at is null) then
      raise exception 'ALREADY_IN_ROOM';
    end if;
  end if;

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

  insert into public.challenges (from_user, to_user, game_type, room_code)
  values (uid, target, p_game_type, v_code) returning * into c;
  return public._challenge_json(c, uid);
end;
$$;

-- Accepting: a Ludo invite seats the friend in the host's lobby (or is cancelled if the lobby
-- filled up or started meanwhile); everything else creates a room as before.
create or replace function public._accept_challenge(c public.challenges)
returns public.challenges language plpgsql security definer set search_path = '' as $$
declare
  result public.challenges;
  r public.rooms;
begin
  if c.game_type = 'ludo' and c.room_code is not null then
    select * into r from public.rooms where code = c.room_code and game_type = 'ludo' for update;
    begin
      if not found then raise exception 'ROOM_NOT_FOUND'; end if;
      perform public._ludo_take_seat(r, c.to_user);
    exception when raise_exception then
      update public.challenges set status = 'cancelled', responded_at = now() where id = c.id returning * into result;
      return result;
    end;
    update public.challenges set status = 'accepted', responded_at = now() where id = c.id returning * into result;
    return result;
  end if;

  update public.challenges
     set status = 'accepted', room_code = public._create_game_room(c.from_user, c.to_user, c.game_type), responded_at = now()
   where id = c.id
  returning * into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants & realtime
-- ---------------------------------------------------------------------------
revoke execute on function public._ludo_allowed_seats(smallint)                 from public, anon, authenticated;
revoke execute on function public._ludo_setup(uuid, uuid, uuid, smallint)        from public, anon, authenticated;
revoke execute on function public._ludo_take_seat(public.rooms, uuid)            from public, anon, authenticated;
revoke execute on function public._ludo_leave(public.rooms, uuid)                from public, anon, authenticated;
-- Used inside RLS policies, which run as the caller.
revoke execute on function public._is_room_member(uuid)                          from public, anon;
revoke execute on function public._shares_room_with(uuid)                        from public, anon;
grant  execute on function public._is_room_member(uuid)                          to authenticated;
grant  execute on function public._shares_room_with(uuid)                        to authenticated;

revoke execute on function public.set_ludo_options(uuid, int, text)              from public, anon;
revoke execute on function public.set_ludo_ready(uuid, boolean)                  from public, anon;
revoke execute on function public.send_challenge(text, text, text)               from public, anon;
grant  execute on function public.set_ludo_options(uuid, int, text)              to authenticated;
grant  execute on function public.set_ludo_ready(uuid, boolean)                  to authenticated;
grant  execute on function public.send_challenge(text, text, text)               to authenticated;

alter publication supabase_realtime add table public.room_players, public.ludo_rooms;
