-- Ludo, stage 2: the rules engine (server = final authority), games, secure dice, moves.
--
-- _ludo_roll / _ludo_move mirror src/games/ludo/engine.ts exactly (same state JSON, same events);
-- supabase/tests/ludo-parity.test.ts plays random games through both and fails on any difference.
--
-- State JSON: { colors: [..turn order..], tokens: { red: [p,p,p,p], .. }, turn, phase: roll|move,
--               dice: int|null, sixes: int, placements: [..], finished: bool }
-- Token p: -1 yard · 0–50 shared loop (square = (start + p) % 52) · 51–55 home column · 56 home.

-- ---------------------------------------------------------------------------
-- Pure rule helpers
-- ---------------------------------------------------------------------------
create or replace function public._ludo_start_sq(c text)
returns int language sql immutable set search_path = '' as $$
  select case c when 'red' then 0 when 'green' then 13 when 'yellow' then 26 else 39 end;
$$;

-- Square on the shared loop, or null (yard / home column / home).
create or replace function public._ludo_abs(c text, p int)
returns int language sql immutable set search_path = '' as $$
  select case when p between 0 and 50 then (public._ludo_start_sq(c) + p) % 52 end;
$$;

-- Start squares and the four stars.
create or replace function public._ludo_is_safe(sq int)
returns boolean language sql immutable set search_path = '' as $$
  select sq = any ('{0,8,13,21,26,34,39,47}'::int[]);
$$;

create or replace function public._ludo_can_move(p int, d int)
returns boolean language sql immutable set search_path = '' as $$
  select case when p = -1 then d = 6 else p < 56 and p + d <= 56 end;
$$;

create or replace function public._ludo_tok(s jsonb, c text)
returns int[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(v::int order by i), '{}')
    from jsonb_array_elements_text(s -> 'tokens' -> c) with ordinality t(v, i);
$$;

create or replace function public._ludo_colors(s jsonb)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(v order by i), '{}') from jsonb_array_elements_text(s -> 'colors') with ordinality t(v, i);
$$;

-- Token indexes (0-based) that can move with this roll.
create or replace function public._ludo_legal(s jsonb, c text, d int)
returns int[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(i - 1 order by i), '{}')
    from unnest(public._ludo_tok(s, c)) with ordinality t(p, i)
   where public._ludo_can_move(p, d);
$$;

-- Distinct choices: tokens on the same spot count once (lowest index).
create or replace function public._ludo_distinct(s jsonb, c text, d int)
returns int[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(m order by m), '{}') from (
    select min(i - 1) as m
      from unnest(public._ludo_tok(s, c)) with ordinality t(p, i)
     where public._ludo_can_move(p, d)
     group by p
  ) x;
$$;

-- Next colour in turn order that hasn't finished.
create or replace function public._ludo_next(s jsonb, c text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  cols text[] := public._ludo_colors(s);
  n int := cardinality(cols);
  i int := array_position(cols, c);
  cand text;
begin
  for k in 1 .. n loop
    cand := cols[((i - 1 + k) % n) + 1];
    if not ((s -> 'placements') ? cand) then return cand; end if;
  end loop;
  return c;
end;
$$;

create or replace function public._ludo_pass(s jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select s || jsonb_build_object('turn', public._ludo_next(s, s ->> 'turn'), 'phase', 'roll', 'dice', null, 'sixes', 0);
$$;

create or replace function public._ludo_initial(p_colors text[], p_mode text)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'colors', to_jsonb(p_colors),
    'tokens', (select jsonb_object_agg(c, case when p_mode = 'quick' then '[0,-1,-1,-1]'::jsonb else '[-1,-1,-1,-1]'::jsonb end)
                 from unnest(p_colors) c),
    'turn', p_colors[1], 'phase', 'roll', 'dice', null, 'sixes', 0, 'placements', '[]'::jsonb, 'finished', false);
$$;

-- The current player moves token p_tok with the pending roll. Returns { state, events }.
create or replace function public._ludo_move(s jsonb, p_tok int)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  c text := s ->> 'turn';
  d int := (s ->> 'dice')::int;
  mine int[];
  frm int;
  dest int;
  sq int;
  tokens jsonb;
  caps jsonb := '[]'::jsonb;
  oc text;
  otoks int[];
  done boolean;
  extra boolean;
  placements jsonb;
  remaining text[];
  st jsonb;
  events jsonb;
begin
  if (s ->> 'finished')::boolean or s ->> 'phase' <> 'move' or d is null then raise exception 'NOT_MOVE_PHASE'; end if;
  if p_tok is null or p_tok not between 0 and 3 then raise exception 'ILLEGAL_MOVE'; end if;
  mine := public._ludo_tok(s, c);
  frm := mine[p_tok + 1];
  if not public._ludo_can_move(frm, d) then raise exception 'ILLEGAL_MOVE'; end if;
  dest := case when frm = -1 then 0 else frm + d end;
  mine[p_tok + 1] := dest;
  tokens := (s -> 'tokens') || jsonb_build_object(c, to_jsonb(mine));

  sq := public._ludo_abs(c, dest);
  if sq is not null and not public._ludo_is_safe(sq) then
    foreach oc in array public._ludo_colors(s) loop
      continue when oc = c;
      otoks := public._ludo_tok(s, oc);
      for i in 1 .. cardinality(otoks) loop
        if public._ludo_abs(oc, otoks[i]) = sq then
          caps := caps || jsonb_build_array(jsonb_build_object('color', oc, 'token', i - 1, 'from', otoks[i]));
          otoks[i] := -1;
        end if;
      end loop;
      tokens := tokens || jsonb_build_object(oc, to_jsonb(otoks));
    end loop;
  end if;

  done := (select bool_and(p = 56) from unnest(mine) p);
  placements := s -> 'placements';
  if done then placements := placements || to_jsonb(c); end if;
  extra := not done and (d = 6 or jsonb_array_length(caps) > 0 or dest = 56);
  events := jsonb_build_array(jsonb_build_object(
    'type', 'move', 'color', c, 'token', p_tok, 'from', frm, 'to', dest, 'captured', caps, 'extra', extra, 'done', done));
  st := s || jsonb_build_object('tokens', tokens, 'placements', placements);

  remaining := array(select v from unnest(public._ludo_colors(s)) with ordinality t(v, i) where not (placements ? v) order by i);
  if cardinality(remaining) <= 1 then
    st := st || jsonb_build_object('placements', placements || to_jsonb(remaining), 'phase', 'roll', 'dice', null, 'sixes', 0, 'finished', true);
    return jsonb_build_object('state', st, 'events', events);
  end if;
  if extra then
    st := st || jsonb_build_object('phase', 'roll', 'dice', null, 'sixes', case when d = 6 then (s ->> 'sixes')::int else 0 end);
    return jsonb_build_object('state', st, 'events', events);
  end if;
  return jsonb_build_object('state', public._ludo_pass(st || jsonb_build_object('dice', null)), 'events', events);
end;
$$;

-- The current player rolls d. Three sixes, no legal move, and a single choice (auto-move)
-- are handled here. Returns { state, events }.
create or replace function public._ludo_roll(s jsonb, d int)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  c text := s ->> 'turn';
  sixes int;
  events jsonb;
  st jsonb;
  ch int[];
  mv jsonb;
begin
  if (s ->> 'finished')::boolean or s ->> 'phase' <> 'roll' then raise exception 'NOT_ROLL_PHASE'; end if;
  if d is null or d not between 1 and 6 then raise exception 'INVALID_DICE'; end if;
  events := jsonb_build_array(jsonb_build_object('type', 'roll', 'color', c, 'dice', d));
  sixes := case when d = 6 then (s ->> 'sixes')::int + 1 else 0 end;
  if sixes = 3 then
    return jsonb_build_object('state', public._ludo_pass(s), 'events', events || jsonb_build_array(jsonb_build_object('type', 'three_sixes', 'color', c)));
  end if;
  st := s || jsonb_build_object('phase', 'move', 'dice', d, 'sixes', sixes);
  ch := public._ludo_distinct(st, c, d);
  if cardinality(ch) = 0 then
    return jsonb_build_object('state', public._ludo_pass(st), 'events', events || jsonb_build_array(jsonb_build_object('type', 'no_moves', 'color', c)));
  end if;
  if cardinality(ch) = 1 then
    mv := public._ludo_move(st, ch[1]);
    return jsonb_build_object('state', mv -> 'state', 'events', events || (mv -> 'events'));
  end if;
  return jsonb_build_object('state', st, 'events', events);
end;
$$;

-- ---------------------------------------------------------------------------
-- Games
-- ---------------------------------------------------------------------------
create table public.ludo_games (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms (id) on delete cascade,
  status       text not null default 'playing' check (status in ('playing', 'finished', 'abandoned')),
  mode         text not null check (mode in ('classic', 'quick')),
  -- colour → player id, for the players at the table.
  seats        jsonb not null,
  state        jsonb not null,
  last_roll    smallint,
  -- What the last action did (roll, moves, captures) — the app animates from this.
  last_events  jsonb not null default '[]'::jsonb,
  -- Bumped by every roll and move; actions must send the seq they saw (double taps are refused).
  seq          int not null default 0,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz
);
create unique index ludo_games_one_playing on public.ludo_games (room_id) where status = 'playing';
create index ludo_games_room_idx on public.ludo_games (room_id, started_at desc);

alter table public.ludo_games enable row level security;
create policy "ludo_games: room members read" on public.ludo_games
  for select to authenticated using (public._is_room_member(room_id));
revoke all on public.ludo_games from anon;
revoke insert, update, delete on public.ludo_games from authenticated;

-- Test-only scripted dice for the e2e test. Only the service role (the secret key, kept in
-- .env.test.local on the developer's PC) can write here; players can't read or write it.
-- Real rooms never have rows, so roll_dice uses secure random dice for them.
create table public.ludo_test_dice (
  id          bigserial primary key,
  room_id     uuid not null references public.rooms (id) on delete cascade,
  value       smallint not null check (value between 1 and 6),
  created_at  timestamptz not null default now()
);
create index ludo_test_dice_room_idx on public.ludo_test_dice (room_id, id);
alter table public.ludo_test_dice enable row level security;  -- no policies: API roles see nothing
revoke all on public.ludo_test_dice from anon, authenticated;
grant select, insert, delete on public.ludo_test_dice to service_role;
grant usage, select on sequence public.ludo_test_dice_id_seq to service_role;

-- One die: the next scripted test value for this room if any, else secure random. gen_random_uuid()
-- uses the server's cryptographic RNG; rejection sampling keeps all six faces equally likely.
create or replace function public._ludo_draw_die(p_room_id uuid)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  t public.ludo_test_dice;
  b int;
begin
  select * into t from public.ludo_test_dice where room_id = p_room_id order by id limit 1 for update;
  if found then
    delete from public.ludo_test_dice where id = t.id;
    return t.value;
  end if;
  loop
    b := get_byte(decode(substr(replace(gen_random_uuid()::text, '-', ''), 1, 2), 'hex'), 0);
    if b < 252 then return b % 6 + 1; end if;
  end loop;
end;
$$;

-- Game over: results stay on the game; the room goes back to the lobby (guests press Ready again).
create or replace function public._ludo_finish(g public.ludo_games)
returns void language plpgsql security definer set search_path = '' as $$
declare
  host uuid;
begin
  update public.ludo_games set status = 'finished', ended_at = now() where id = g.id;
  update public.rooms set status = 'waiting', updated_at = now() where id = g.room_id returning player_x into host;
  update public.room_players set ready = (player_id = host) where room_id = g.room_id and left_at is null;
end;
$$;

-- Loads a game for an action (locked) and returns the caller's colour.
create or replace function public._ludo_game_for_action(p_game_id uuid, out g public.ludo_games, out my_color text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into g from public.ludo_games where id = p_game_id for update;
  if not found or not public._is_room_member(g.room_id) then raise exception 'GAME_NOT_FOUND'; end if;
  if g.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;
  select key into my_color from jsonb_each_text(g.seats) where value = auth.uid()::text;
  if my_color is null then raise exception 'GAME_NOT_FOUND'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------

-- Host starts: at least 2 seated, every guest ready. Turn order = seat order (host first).
create or replace function public.start_ludo(p_room_id uuid)
returns public.ludo_games language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  lr public.ludo_rooms;
  cols text[];
  g public.ludo_games;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into r from public.rooms where id = p_room_id for update;
  if not found or r.game_type <> 'ludo' or not public._is_room_member(r.id) then raise exception 'ROOM_NOT_FOUND'; end if;
  if auth.uid() <> r.player_x then raise exception 'NOT_HOST'; end if;
  if r.status <> 'waiting' then raise exception 'GAME_STARTED'; end if;
  if (select count(*) from public.room_players where room_id = r.id and left_at is null) < 2 then raise exception 'NOT_ENOUGH_PLAYERS'; end if;
  if exists (select 1 from public.room_players where room_id = r.id and left_at is null and not ready) then raise exception 'NOT_ALL_READY'; end if;

  select * into lr from public.ludo_rooms where room_id = r.id;
  select array_agg(color order by seat) into cols from public.room_players where room_id = r.id and left_at is null;
  insert into public.ludo_games (room_id, mode, seats, state)
  values (r.id, lr.mode,
          (select jsonb_object_agg(color, player_id) from public.room_players where room_id = r.id and left_at is null),
          public._ludo_initial(cols, lr.mode))
  returning * into g;
  update public.rooms set status = 'playing', updated_at = now() where id = r.id;
  return g;
end;
$$;

-- Rolls the dice for the current player. The value is chosen here (never by the app).
create or replace function public.roll_dice(p_game_id uuid, p_seq int)
returns public.ludo_games language plpgsql security definer set search_path = '' as $$
declare
  a record;
  g public.ludo_games;
  d int;
  res jsonb;
begin
  select * into a from public._ludo_game_for_action(p_game_id);
  g := a.g;
  if g.state ->> 'turn' is distinct from a.my_color then raise exception 'NOT_YOUR_TURN'; end if;
  if p_seq is distinct from g.seq then raise exception 'STALE_MOVE'; end if;
  if g.state ->> 'phase' <> 'roll' then raise exception 'NOT_ROLL_PHASE'; end if;

  d := public._ludo_draw_die(g.room_id);
  res := public._ludo_roll(g.state, d);
  update public.ludo_games
     set state = res -> 'state', last_roll = d, last_events = res -> 'events', seq = seq + 1
   where id = g.id
  returning * into g;
  if (g.state ->> 'finished')::boolean then perform public._ludo_finish(g); end if;
  return (select x from public.ludo_games x where x.id = g.id);
end;
$$;

-- Moves one of the caller's tokens with the pending roll (checked against the rules).
create or replace function public.move_token(p_game_id uuid, p_token int, p_seq int)
returns public.ludo_games language plpgsql security definer set search_path = '' as $$
declare
  a record;
  g public.ludo_games;
  res jsonb;
begin
  select * into a from public._ludo_game_for_action(p_game_id);
  g := a.g;
  if g.state ->> 'turn' is distinct from a.my_color then raise exception 'NOT_YOUR_TURN'; end if;
  if p_seq is distinct from g.seq then raise exception 'STALE_MOVE'; end if;
  if g.state ->> 'phase' <> 'move' then raise exception 'NOT_MOVE_PHASE'; end if;
  if p_token is null or not (p_token = any (public._ludo_legal(g.state, a.my_color, (g.state ->> 'dice')::int))) then
    raise exception 'ILLEGAL_MOVE';
  end if;

  res := public._ludo_move(g.state, p_token);
  update public.ludo_games
     set state = res -> 'state', last_events = res -> 'events', seq = seq + 1
   where id = g.id
  returning * into g;
  if (g.state ->> 'finished')::boolean then perform public._ludo_finish(g); end if;
  return (select x from public.ludo_games x where x.id = g.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants & realtime
-- ---------------------------------------------------------------------------
revoke execute on function public._ludo_start_sq(text)                    from public, anon, authenticated;
revoke execute on function public._ludo_abs(text, int)                    from public, anon, authenticated;
revoke execute on function public._ludo_is_safe(int)                      from public, anon, authenticated;
revoke execute on function public._ludo_can_move(int, int)                from public, anon, authenticated;
revoke execute on function public._ludo_tok(jsonb, text)                  from public, anon, authenticated;
revoke execute on function public._ludo_colors(jsonb)                     from public, anon, authenticated;
revoke execute on function public._ludo_legal(jsonb, text, int)           from public, anon, authenticated;
revoke execute on function public._ludo_distinct(jsonb, text, int)        from public, anon, authenticated;
revoke execute on function public._ludo_next(jsonb, text)                 from public, anon, authenticated;
revoke execute on function public._ludo_pass(jsonb)                       from public, anon, authenticated;
revoke execute on function public._ludo_initial(text[], text)             from public, anon, authenticated;
revoke execute on function public._ludo_move(jsonb, int)                  from public, anon, authenticated;
revoke execute on function public._ludo_roll(jsonb, int)                  from public, anon, authenticated;
revoke execute on function public._ludo_draw_die(uuid)                    from public, anon, authenticated;
revoke execute on function public._ludo_finish(public.ludo_games)         from public, anon, authenticated;
revoke execute on function public._ludo_game_for_action(uuid)             from public, anon, authenticated;

revoke execute on function public.start_ludo(uuid)              from public, anon;
revoke execute on function public.roll_dice(uuid, int)          from public, anon;
revoke execute on function public.move_token(uuid, int, int)    from public, anon;
grant  execute on function public.start_ludo(uuid)              to authenticated;
grant  execute on function public.roll_dice(uuid, int)          to authenticated;
grant  execute on function public.move_token(uuid, int, int)    to authenticated;

alter publication supabase_realtime add table public.ludo_games;
