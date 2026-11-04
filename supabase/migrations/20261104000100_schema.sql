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
