-- Tiktoe: ALL migrations combined, in order. Paste into Supabase SQL Editor and click Run ONCE.
-- Wrapped in a transaction: if anything fails, nothing is applied.
begin;

-- ===================== 20261104000100_schema.sql =====================
-- Tiktoe schema: players, rooms (a series between two friends), games (one round each).

create table public.players (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 24),
  avatar      text not null default '😎' check (char_length(avatar) between 1 and 16),
  color       text not null default 'violet' check (color ~ '^[a-z]{3,12}$'),
  created_at  timestamptz not null default now()
);

-- Codes use an alphabet without look-alikes (no I, O, 0, 1).
create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{5}$'),
  player_x    uuid not null references public.players (id) on delete cascade,
  player_o    uuid references public.players (id) on delete set null,
  status      text not null default 'waiting'
              check (status in ('waiting', 'playing', 'abandoned')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (player_o is null or player_o <> player_x)
);

create index rooms_player_x_idx on public.rooms (player_x);
create index rooms_player_o_idx on public.rooms (player_o);

-- board: 9 chars, row-major, each 'X', 'O' or '.'.
-- moves: [{ "cell": 0-8, "mark": "X"|"O", "at": timestamptz }, ...]
create table public.games (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms (id) on delete cascade,
  round          int  not null check (round >= 1),
  board          text not null default '.........' check (board ~ '^[XO.]{9}$'),
  starting_turn  text not null check (starting_turn in ('X', 'O')),
  current_turn   text check (current_turn in ('X', 'O')),
  status         text not null default 'playing'
                 check (status in ('playing', 'finished', 'abandoned')),
  winner         text check (winner in ('X', 'O', 'draw')),
  winning_line   smallint[],
  moves          jsonb not null default '[]'::jsonb,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  unique (room_id, round)
);

create index games_room_round_idx on public.games (room_id, round desc);
-- At most one live round per room.
create unique index games_one_playing_per_room on public.games (room_id) where status = 'playing';

-- ===================== 20261104000200_rls.sql =====================
-- Row Level Security.
-- Clients may read their own data and edit their own profile. Every write to
-- rooms/games goes through the security-definer functions in the next migration.

alter table public.players enable row level security;
alter table public.rooms   enable row level security;
alter table public.games   enable row level security;

-- players: read yourself and anyone you share a room with.
create policy "players: read self and opponents"
  on public.players for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.rooms r
      where (r.player_x = (select auth.uid()) and r.player_o = players.id)
         or (r.player_o = (select auth.uid()) and r.player_x = players.id)
    )
  );

create policy "players: insert self"
  on public.players for insert to authenticated
  with check (id = (select auth.uid()));

create policy "players: update self"
  on public.players for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- rooms: members only, read-only.
create policy "rooms: members read"
  on public.rooms for select to authenticated
  using ((select auth.uid()) in (player_x, player_o));

-- games: members of the room only, read-only.
create policy "games: members read"
  on public.games for select to authenticated
  using (
    exists (
      select 1 from public.rooms r
      where r.id = games.room_id
        and (select auth.uid()) in (r.player_x, r.player_o)
    )
  );

-- Belt and braces: no direct writes to rooms/games from API roles.
revoke insert, update, delete on public.rooms from anon, authenticated;
revoke insert, update, delete on public.games from anon, authenticated;
revoke all on public.players from anon;

-- ===================== 20261104000300_functions.sql =====================
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

-- ===================== 20261104000400_realtime.sql =====================
-- Stream row changes to subscribed clients. Realtime applies the RLS select
-- policies, so each client only receives rows for rooms they belong to.
alter publication supabase_realtime add table public.rooms, public.games;

commit;
