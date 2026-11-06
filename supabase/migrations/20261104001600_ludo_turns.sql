-- Ludo, stage 3: 3–4 players, turn timers, auto-play, away players, and leaving mid-game.
--
-- * Engine (mirrors src/games/ludo/engine.ts; covered by the parity test): players can forfeit
--   (state.forfeited — skipped, ranked last), and _ludo_best_move picks the auto-play move.
-- * Turn clock: 20 s to roll, then 20 s to move (1.5 s for players marked away). A trigger stamps
--   the deadline on every action, so start_ludo/roll_dice/move_token are unchanged.
-- * ludo_timeout: after the deadline, any seated player's app can ask the server to play the
--   current turn (auto-roll + best move). 3 timeouts in a row → away (fast auto-play) until the
--   player acts again or taps "I'm back" (ludo_resume).

-- ---------------------------------------------------------------------------
-- Engine additions
-- ---------------------------------------------------------------------------

-- Still in the game: not finished, not left.
create or replace function public._ludo_active(s jsonb, c text)
returns boolean language sql immutable set search_path = '' as $$
  select not ((s -> 'placements') ? c) and not (coalesce(s -> 'forfeited', '[]'::jsonb) ? c);
$$;

-- Next active colour in turn order (skips finished players and leavers).
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
    if public._ludo_active(s, cand) then return cand; end if;
  end loop;
  return c;
end;
$$;

-- Final standings once one active player is left: finishers, the last active player, then
-- leavers (latest first, so the first to leave ranks last).
create or replace function public._ludo_end(s jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select s || jsonb_build_object(
    'placements', (s -> 'placements')
                  || coalesce((select jsonb_agg(c order by i) from unnest(public._ludo_colors(s)) with ordinality t(c, i) where public._ludo_active(s, c)), '[]'::jsonb)
                  || coalesce((select jsonb_agg(v order by i desc) from jsonb_array_elements_text(coalesce(s -> 'forfeited', '[]'::jsonb)) with ordinality t(v, i)), '[]'::jsonb),
    'phase', 'roll', 'dice', null, 'sixes', 0, 'finished', true);
$$;

create or replace function public._ludo_initial(p_colors text[], p_mode text)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'colors', to_jsonb(p_colors),
    'tokens', (select jsonb_object_agg(c, case when p_mode = 'quick' then '[0,-1,-1,-1]'::jsonb else '[-1,-1,-1,-1]'::jsonb end)
                 from unnest(p_colors) c),
    'turn', p_colors[1], 'phase', 'roll', 'dice', null, 'sixes', 0, 'placements', '[]'::jsonb, 'forfeited', '[]'::jsonb, 'finished', false);
$$;

-- Same as 0015 except the end-of-game check counts only active players (leavers are skipped).
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

  if (select count(*) from unnest(public._ludo_colors(st)) x where public._ludo_active(st, x)) <= 1 then
    return jsonb_build_object('state', public._ludo_end(st), 'events', events);
  end if;
  if extra then
    st := st || jsonb_build_object('phase', 'roll', 'dice', null, 'sixes', case when d = 6 then (s ->> 'sixes')::int else 0 end);
    return jsonb_build_object('state', st, 'events', events);
  end if;
  return jsonb_build_object('state', public._ludo_pass(st || jsonb_build_object('dice', null)), 'events', events);
end;
$$;

-- A player leaves mid-game: tokens off the board, turns skipped, ranked last.
create or replace function public._ludo_forfeit(s jsonb, c text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  st jsonb;
  events jsonb;
begin
  if (s ->> 'finished')::boolean or not ((s -> 'colors') ? c) or not public._ludo_active(s, c) then
    return jsonb_build_object('state', s, 'events', '[]'::jsonb);
  end if;
  st := s || jsonb_build_object(
    'forfeited', coalesce(s -> 'forfeited', '[]'::jsonb) || to_jsonb(c),
    'tokens', (s -> 'tokens') || jsonb_build_object(c, '[-1,-1,-1,-1]'::jsonb));
  events := jsonb_build_array(jsonb_build_object('type', 'forfeit', 'color', c));
  if (select count(*) from unnest(public._ludo_colors(st)) x where public._ludo_active(st, x)) <= 1 then
    return jsonb_build_object('state', public._ludo_end(st), 'events', events);
  end if;
  if st ->> 'turn' = c then st := public._ludo_pass(st); end if;
  return jsonb_build_object('state', st, 'events', events);
end;
$$;

-- Auto-play choice: capture › reach home › bring a token out › safe square › most advanced token.
create or replace function public._ludo_best_move(s jsonb, c text, d int)
returns int language sql immutable set search_path = '' as $$
  select i from (
    select t.i,
           case
             when sq is not null and not public._ludo_is_safe(sq) and exists (
               select 1 from unnest(public._ludo_colors(s)) oc
                where oc <> c and exists (select 1 from unnest(public._ludo_tok(s, oc)) q where public._ludo_abs(oc, q) = sq))
               then 5000
             when dest = 56 then 4000
             when frm = -1 then 3000
             when sq is not null and public._ludo_is_safe(sq) then 2000 + frm
             else 1000 + frm
           end as score
      from (
        select i - 1 as i, p as frm, case when p = -1 then 0 else p + d end as dest,
               public._ludo_abs(c, case when p = -1 then 0 else p + d end) as sq
          from unnest(public._ludo_tok(s, c)) with ordinality u(p, i)
         where public._ludo_can_move(p, d)
      ) t
  ) scored
  order by score desc, i
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Turn clock, timeouts, away players
-- ---------------------------------------------------------------------------
alter table public.ludo_games
  add column turn_started_at timestamptz,
  add column turn_deadline timestamptz,
  -- consecutive timeouts per colour, e.g. {"red": 2}
  add column timeouts jsonb not null default '{}'::jsonb,
  -- colours being auto-played (3 timeouts in a row), e.g. ["green"]
  add column away jsonb not null default '[]'::jsonb;

-- Stamps the deadline on every action (seq change). A player acting themselves (not a server-made
-- timeout/forfeit, which set ludo.auto) also gets their timeout count and away flag cleared.
create or replace function public._ludo_turn_clock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.seq = old.seq then return new; end if;
  if tg_op = 'UPDATE' and coalesce(current_setting('ludo.auto', true), '') <> '1' then
    new.timeouts := new.timeouts - (old.state ->> 'turn');
    new.away := coalesce((select jsonb_agg(x) from jsonb_array_elements_text(new.away) x where x <> old.state ->> 'turn'), '[]'::jsonb);
  end if;
  new.turn_started_at := now();
  new.turn_deadline := case
    when (new.state ->> 'finished')::boolean then null
    when new.away ? (new.state ->> 'turn') then now() + interval '1.5 seconds'
    else now() + interval '20 seconds'
  end;
  return new;
end;
$$;
create trigger ludo_games_turn_clock
  before insert or update on public.ludo_games
  for each row execute function public._ludo_turn_clock();

-- Games already running when this migration is applied get a fresh clock.
update public.ludo_games set turn_started_at = now(), turn_deadline = now() + interval '20 seconds' where status = 'playing';

-- Game over: results stay on the game; the room goes back to the lobby — or closes if the host left.
create or replace function public._ludo_finish(g public.ludo_games)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  host_seated boolean;
begin
  update public.ludo_games set status = 'finished', ended_at = now(), turn_deadline = null where id = g.id;
  select * into r from public.rooms where id = g.room_id;
  host_seated := exists (select 1 from public.room_players where room_id = r.id and player_id = r.player_x and left_at is null);
  update public.rooms set status = case when host_seated then 'waiting' else 'abandoned' end, updated_at = now() where id = r.id;
  update public.room_players set ready = (player_id = r.player_x) where room_id = r.id and left_at is null;
end;
$$;

-- The deadline passed: play the current turn automatically (any seated player's app may ask; the
-- first request wins, later ones are STALE_MOVE). Auto-roll if needed, then the best simple move.
create or replace function public.ludo_timeout(p_game_id uuid, p_seq int)
returns public.ludo_games language plpgsql security definer set search_path = '' as $$
declare
  a record;
  g public.ludo_games;
  c text;
  st jsonb;
  events jsonb := '[]'::jsonb;
  d int;
  res jsonb;
  n int;
  v_timeouts jsonb;
  v_away jsonb;
begin
  select * into a from public._ludo_game_for_action(p_game_id);
  g := a.g;
  if p_seq is distinct from g.seq then raise exception 'STALE_MOVE'; end if;
  if g.turn_deadline is null or now() < g.turn_deadline then raise exception 'TOO_EARLY'; end if;
  perform set_config('ludo.auto', '1', true);
  c := g.state ->> 'turn';
  st := g.state;

  if st ->> 'phase' = 'roll' then
    d := public._ludo_draw_die(g.room_id);
    res := public._ludo_roll(st, d);
    st := res -> 'state';
    events := res -> 'events';
  end if;
  if st ->> 'phase' = 'move' and st ->> 'turn' = c and not (st ->> 'finished')::boolean then
    res := public._ludo_move(st, public._ludo_best_move(st, c, (st ->> 'dice')::int));
    st := res -> 'state';
    events := events || (res -> 'events');
  end if;

  v_timeouts := g.timeouts;
  v_away := g.away;
  if not (v_away ? c) then
    n := coalesce((v_timeouts ->> c)::int, 0) + 1;
    v_timeouts := v_timeouts || jsonb_build_object(c, n);
    if n >= 3 then v_away := v_away || to_jsonb(c); end if;
  end if;

  update public.ludo_games
     set state = st, last_roll = coalesce(d, last_roll), last_events = events, seq = seq + 1, timeouts = v_timeouts, away = v_away
   where id = g.id
  returning * into g;
  if (g.state ->> 'finished')::boolean then perform public._ludo_finish(g); end if;
  return (select x from public.ludo_games x where x.id = g.id);
end;
$$;

-- "I'm back": stop auto-playing my turns (a manual roll or move does the same).
create or replace function public.ludo_resume(p_game_id uuid)
returns public.ludo_games language plpgsql security definer set search_path = '' as $$
declare
  a record;
  g public.ludo_games;
begin
  select * into a from public._ludo_game_for_action(p_game_id);
  g := a.g;
  update public.ludo_games
     set away = coalesce((select jsonb_agg(x) from jsonb_array_elements_text(away) x where x <> a.my_color), '[]'::jsonb),
         timeouts = timeouts - a.my_color,
         turn_started_at = case when state ->> 'turn' = a.my_color then now() else turn_started_at end,
         turn_deadline = case when state ->> 'turn' = a.my_color then now() + interval '20 seconds' else turn_deadline end
   where id = g.id
  returning * into g;
  return g;
end;
$$;

-- Leaving: in the lobby as before (0014); during a game you forfeit (ranked last) and your seat frees.
create or replace function public._ludo_leave(r public.rooms, p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.ludo_games;
  c text;
  res jsonb;
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

  if r.status = 'playing' then
    select * into g from public.ludo_games where room_id = r.id and status = 'playing' for update;
    if found then
      select key into c from jsonb_each_text(g.seats) where value = p_uid::text;
      if c is not null then
        perform set_config('ludo.auto', '1', true);
        res := public._ludo_forfeit(g.state, c);
        update public.ludo_games
           set state = res -> 'state', last_events = res -> 'events', seq = seq + 1,
               away = coalesce((select jsonb_agg(x) from jsonb_array_elements_text(away) x where x <> c), '[]'::jsonb)
         where id = g.id
        returning * into g;
        if (g.state ->> 'finished')::boolean then perform public._ludo_finish(g); end if;
      end if;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public._ludo_active(jsonb, text)            from public, anon, authenticated;
revoke execute on function public._ludo_end(jsonb)                     from public, anon, authenticated;
revoke execute on function public._ludo_forfeit(jsonb, text)           from public, anon, authenticated;
revoke execute on function public._ludo_best_move(jsonb, text, int)    from public, anon, authenticated;
revoke execute on function public._ludo_turn_clock()                   from public, anon, authenticated;

revoke execute on function public.ludo_timeout(uuid, int)   from public, anon;
revoke execute on function public.ludo_resume(uuid)         from public, anon;
grant  execute on function public.ludo_timeout(uuid, int)   to authenticated;
grant  execute on function public.ludo_resume(uuid)         to authenticated;
