-- Public profiles, server-side stats, and invite previews.
--
-- Public data is only reachable through the security-definer functions below,
-- which return safe fields: display name, avatar, colour, a random public
-- handle, stats, and match results. Never auth ids, emails, or room codes.

-- ---------------------------------------------------------------------------
-- Public handle: random, URL-safe, used in /u/<handle> instead of the auth id.
-- ---------------------------------------------------------------------------
create or replace function public.gen_handle()
returns text
language sql
volatile
set search_path = ''
as $$
  -- 31-char alphabet without look-alikes (no 0/o, 1/l/i). 31^8 ≈ 8.5e11 handles.
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 8);
$$;

-- Volatile default: every existing row gets its own handle.
alter table public.players
  add column handle text not null default public.gen_handle()
  check (handle ~ '^[a-hjkmnp-z2-9]{8}$');
alter table public.players add constraint players_handle_key unique (handle);

-- Players may edit only their display fields. In particular, created_at
-- ("member since") and handle are server-controlled.
revoke insert, update on public.players from authenticated;
grant insert (id, name, avatar, color) on public.players to authenticated;
grant update (id, name, avatar, color) on public.players to authenticated;

-- ---------------------------------------------------------------------------
-- Internal: one row per finished round for a player, from their seat.
-- ---------------------------------------------------------------------------
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
     and p_player in (r.player_x, r.player_o);
$$;

-- ---------------------------------------------------------------------------
-- Internal: the stats summary, calculated from finished rounds only.
--   win_rate        wins / games (draws count as games), null with no games
--   current_streak  run of identical results ending with the latest game
--   current_win_streak / best_win_streak  consecutive wins
-- ---------------------------------------------------------------------------
create or replace function public._player_stats(p_player uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with res as (
    select result, row_number() over (order by ended_at desc, round desc) as rn
      from public._player_results(p_player)
  ),
  latest as (select result from res where rn = 1),
  -- Gaps-and-islands: consecutive equal results share (rn - rank within result).
  islands as (
    select result, rn, rn - row_number() over (partition by result order by rn) as grp
      from res
  ),
  runs as (
    select result, grp, count(*) as len, min(rn) as first_rn
      from islands
     group by result, grp
  )
  select jsonb_build_object(
    'total',  (select count(*) from res),
    'wins',   (select count(*) from res where result = 'win'),
    'losses', (select count(*) from res where result = 'loss'),
    'draws',  (select count(*) from res where result = 'draw'),
    'win_rate', (select round(count(*) filter (where result = 'win')::numeric / nullif(count(*), 0), 4) from res),
    'current_streak', (
      select jsonb_build_object('result', result, 'count', len) from runs where first_rn = 1
    ),
    'current_win_streak', coalesce((select len from runs where first_rn = 1 and result = 'win'), 0),
    'best_win_streak',    coalesce((select max(len) from runs where result = 'win'), 0)
  );
$$;

-- Safe public view of a player.
create or replace function public._public_player(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('handle', handle, 'name', name, 'avatar', avatar, 'color', color)
    from public.players where id = p_id;
$$;

-- Head-to-head between two players, from p_me's side.
create or replace function public._head_to_head(p_me uuid, p_other uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'wins',   count(*) filter (where result = 'win'),
    'losses', count(*) filter (where result = 'loss'),
    'draws',  count(*) filter (where result = 'draw'),
    'total',  count(*),
    'last_played_at', max(ended_at)
  )
  from public._player_results(p_me)
  where opponent = p_other;
$$;

-- ---------------------------------------------------------------------------
-- get_public_profile: anyone with the handle (signed in or not).
-- Includes the viewer's head-to-head when the viewer is signed in and has played them.
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
      ), '[]'::jsonb)
    )
    from public.players p where p.id = pid
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_my_stats: the signed-in player's summary and per-friend records (/history).
-- ---------------------------------------------------------------------------
create or replace function public.get_my_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  return jsonb_build_object(
    'stats', public._player_stats(me),
    'head_to_head', coalesce((
      select jsonb_agg(
               jsonb_build_object('opponent', public._public_player(o.opponent)) || public._head_to_head(me, o.opponent)
               order by o.games desc, o.last desc
             )
        from (
          select opponent, count(*) as games, max(ended_at) as last
            from public._player_results(me)
           where opponent is not null
           group by opponent
        ) o
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_room_invite: what a link preview needs. Host display fields + room state only.
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
           'is_full', r.player_o is not null
         )
    from public.rooms r
   where r.code = upper(btrim(p_code));
$$;

-- gen_handle runs as the column default when a profile is created, so signed-in
-- users need EXECUTE on it (it only returns a random string).
revoke execute on function public.gen_handle()                 from public, anon;
grant  execute on function public.gen_handle()                 to authenticated;

-- Internal helpers are not callable through the API.
revoke execute on function public._player_results(uuid)        from public, anon, authenticated;
revoke execute on function public._player_stats(uuid)          from public, anon, authenticated;
revoke execute on function public._public_player(uuid)         from public, anon, authenticated;
revoke execute on function public._head_to_head(uuid, uuid)    from public, anon, authenticated;

-- Public read-only lookups (link previews and shared profiles work signed out).
revoke execute on function public.get_public_profile(text, int) from public;
revoke execute on function public.get_room_invite(text)         from public;
grant  execute on function public.get_public_profile(text, int) to anon, authenticated;
grant  execute on function public.get_room_invite(text)         to anon, authenticated;

revoke execute on function public.get_my_stats() from public, anon;
grant  execute on function public.get_my_stats() to authenticated;
