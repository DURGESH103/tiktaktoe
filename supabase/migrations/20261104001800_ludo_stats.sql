-- Ludo Stage 5: per-player results, stats and history.
--  * ludo_games.captures: tokens captured per colour in a game (counted from each update's events).
--  * ludo_results: one row per player when a game finishes (place, players, captures, …), written
--    by a trigger, so the game RPCs don't change. Read only through the functions below.
--  * get_my_ludo(): my Ludo stats + recent games (players, placings, date) for /history.
--  * get_public_profile: same as before, plus a "ludo" stats object.
-- Tic-Tac-Toe and Couple stats/history are unchanged.

-- ---------------------------------------------------------------------------
-- Captures
-- ---------------------------------------------------------------------------
alter table public.ludo_games add column if not exists captures jsonb not null default '{}'::jsonb;

-- Every game action bumps seq and replaces last_events: add the captures in those events.
create or replace function public._ludo_count_captures()
returns trigger language plpgsql set search_path = '' as $$
declare
  e jsonb;
  c text;
begin
  if new.seq is distinct from old.seq and new.last_events is distinct from old.last_events then
    for e in select * from jsonb_array_elements(coalesce(new.last_events, '[]'::jsonb)) loop
      if e ->> 'type' = 'move' and jsonb_array_length(coalesce(e -> 'captured', '[]'::jsonb)) > 0 then
        c := e ->> 'color';
        new.captures := jsonb_set(new.captures, array[c], to_jsonb(coalesce((new.captures ->> c)::int, 0) + jsonb_array_length(e -> 'captured')));
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists ludo_count_captures on public.ludo_games;
create trigger ludo_count_captures before update on public.ludo_games
  for each row execute function public._ludo_count_captures();

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------
create table if not exists public.ludo_results (
  game_id    uuid        not null references public.ludo_games (id) on delete cascade,
  player_id  uuid        not null references public.players (id) on delete cascade,
  color      text        not null,
  place      smallint    not null check (place between 1 and 4),
  players    smallint    not null check (players between 2 and 4),
  captures   int         not null default 0,
  forfeited  boolean     not null default false,
  mode       text        not null,
  ended_at   timestamptz not null,
  primary key (game_id, player_id)
);
create index if not exists ludo_results_player_idx on public.ludo_results (player_id, ended_at desc);

alter table public.ludo_results enable row level security;
revoke all on public.ludo_results from anon, authenticated;

-- Placements are colours in finishing order (forfeiters last), so place = position + 1.
create or replace function public._ludo_record_results(g public.ludo_games)
returns void language sql security definer set search_path = '' as $$
  insert into public.ludo_results (game_id, player_id, color, place, players, captures, forfeited, mode, ended_at)
  select g.id, (g.seats ->> pl.color)::uuid, pl.color, pl.idx, jsonb_array_length(g.state -> 'placements'),
         coalesce((g.captures ->> pl.color)::int, 0),
         coalesce(g.state -> 'forfeited', '[]'::jsonb) ? pl.color,
         g.mode, coalesce(g.ended_at, now())
    from jsonb_array_elements_text(g.state -> 'placements') with ordinality as pl (color, idx)
   where g.seats ->> pl.color is not null
  on conflict (game_id, player_id) do nothing;
$$;

create or replace function public._ludo_results_on_finish()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'finished' and old.status is distinct from 'finished' and jsonb_array_length(coalesce(new.state -> 'placements', '[]'::jsonb)) >= 2 then
    perform public._ludo_record_results(new);
  end if;
  return null;
end;
$$;

drop trigger if exists ludo_results_on_finish on public.ludo_games;
create trigger ludo_results_on_finish after update of status on public.ludo_games
  for each row execute function public._ludo_results_on_finish();

-- Games that finished before this migration (their captures weren't counted: 0).
select public._ludo_record_results(g)
  from public.ludo_games g
 where g.status = 'finished' and jsonb_array_length(coalesce(g.state -> 'placements', '[]'::jsonb)) >= 2;

-- ---------------------------------------------------------------------------
-- Stats: games, 1st places, podiums (top 3, last place never counts), captures, win streaks.
-- ---------------------------------------------------------------------------
create or replace function public._ludo_stats(p_player uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with r as (
    select ended_at, place = 1 as won, place <= least(3, players - 1) as podium, captures
      from public.ludo_results where player_id = p_player
  ),
  runs as (
    select won, count(*) as len
      from (select won, row_number() over (order by ended_at) - row_number() over (partition by won order by ended_at) as grp from r) x
     group by won, grp
  )
  select jsonb_build_object(
    'games', (select count(*) from r),
    'wins', (select count(*) from r where won),
    'podiums', (select count(*) from r where podium),
    'captures', (select coalesce(sum(captures), 0) from r),
    'current_win_streak', (select count(*) from r where won and ended_at > coalesce((select max(ended_at) from r where not won), '-infinity'::timestamptz)),
    'best_win_streak', coalesce((select max(len) from runs where won), 0),
    'last_played_at', (select max(ended_at) from r)
  );
$$;

-- Recent games of a player: date, mode, their place and captures, and everyone's placings.
create or replace function public._ludo_recent(p_player uuid, p_limit int)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.g order by x.ended_at desc), '[]'::jsonb)
    from (
      select me.ended_at,
             jsonb_build_object(
               'game_id', me.game_id,
               'ended_at', me.ended_at,
               'mode', me.mode,
               'place', me.place,
               'players', me.players,
               'captures', me.captures,
               'standings', (
                 select jsonb_agg(jsonb_build_object('player', public._public_player(o.player_id), 'color', o.color, 'place', o.place, 'forfeited', o.forfeited, 'captures', o.captures) order by o.place)
                   from public.ludo_results o where o.game_id = me.game_id
               )
             ) as g
        from public.ludo_results me
       where me.player_id = p_player
       order by me.ended_at desc
       limit least(greatest(coalesce(p_limit, 30), 1), 100)
    ) x;
$$;

create or replace function public.get_my_ludo(p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  return jsonb_build_object('stats', public._ludo_stats(me), 'games', public._ludo_recent(me, p_limit));
end;
$$;

-- ---------------------------------------------------------------------------
-- get_public_profile: the 0005 definition verbatim, plus 'ludo' (stats).
-- ---------------------------------------------------------------------------
create or replace function public.get_public_profile(p_handle text, p_recent int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid;
  viewer uuid := auth.uid();
  h2h jsonb;
begin
  select id into pid from public.players where handle = lower(btrim(p_handle));
  if pid is null then
    return null;
  end if;

  if viewer is not null and viewer <> pid then
    h2h := public._head_to_head(viewer, pid);
    if (h2h ->> 'total')::int = 0 then
      h2h := null;
    end if;
  end if;

  return (
    select jsonb_build_object(
      'player', public._public_player(pid) || jsonb_build_object('member_since', p.created_at),
      'is_me', coalesce(viewer = pid, false),
      'stats', public._player_stats(pid),
      'head_to_head', h2h,
      'recent', coalesce((
        select jsonb_agg(m order by m_ended desc)
          from (
            select jsonb_build_object(
                     'opponent', public._public_player(x.opponent),
                     'result', x.result,
                     'ended_at', x.ended_at,
                     'moves', x.moves
                   ) as m,
                   x.ended_at as m_ended
              from public._player_results(pid) x
             order by x.ended_at desc, x.round desc
             limit least(greatest(coalesce(p_recent, 20), 1), 50)
          ) recent
      ), '[]'::jsonb),
      'ludo', public._ludo_stats(pid)
    )
    from public.players p where p.id = pid
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public._ludo_count_captures()                     from public, anon, authenticated;
revoke execute on function public._ludo_record_results(public.ludo_games)   from public, anon, authenticated;
revoke execute on function public._ludo_results_on_finish()                 from public, anon, authenticated;
revoke execute on function public._ludo_stats(uuid)                         from public, anon, authenticated;
revoke execute on function public._ludo_recent(uuid, int)                   from public, anon, authenticated;
revoke execute on function public.get_my_ludo(int)                          from public, anon;
grant  execute on function public.get_my_ludo(int)                          to authenticated;
revoke execute on function public.get_public_profile(text, int)             from public;
grant  execute on function public.get_public_profile(text, int)             to anon, authenticated;
