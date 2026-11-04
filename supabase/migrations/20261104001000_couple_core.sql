-- Couple Challenge, stage 2: sessions, rounds, private answers, question rotation, and the
-- Compatibility Test. Tic-Tac-Toe tables and functions are not touched.

-- ---------------------------------------------------------------------------
-- Question bank (all modes). Content is in 0011.
-- ---------------------------------------------------------------------------
create table public.couple_questions (
  id        serial primary key,
  mode      text not null check (mode in ('compatibility', 'memories', 'questions', 'challenges')),
  category  text not null,
  -- Questions deck only: fun → deep → future.
  level     text check (level in ('fun', 'deep', 'future')),
  text_en   text not null,
  text_hi   text not null,  -- Hinglish
  -- Compatibility only: 2–4 choices, each { "en": ..., "hi": ... }.
  options   jsonb,
  active    boolean not null default true,
  check (mode <> 'compatibility' or (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4))
);
create index couple_questions_mode_category_idx on public.couple_questions (mode, category) where active;

-- ---------------------------------------------------------------------------
-- A session = one play-through of a mode in a room (e.g. 10 compatibility questions).
-- ---------------------------------------------------------------------------
create table public.couple_sessions (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms (id) on delete cascade,
  mode           text not null check (mode in ('compatibility', 'memories', 'questions', 'challenges')),
  category       text,
  status         text not null default 'active' check (status in ('active', 'finished', 'abandoned')),
  started_by     uuid references public.players (id) on delete set null,
  current_round  int not null default 1,
  total_rounds   int not null check (total_rounds >= 1),
  points         int not null default 0,
  compat_pct     int check (compat_pct between 0 and 100),
  -- Server-calculated summary, e.g. { x_correct, o_correct, same_answers, title }.
  result         jsonb,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz
);
create unique index couple_sessions_one_active on public.couple_sessions (room_id) where status = 'active';
create index couple_sessions_room_idx on public.couple_sessions (room_id, started_at desc);

create table public.couple_rounds (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.couple_sessions (id) on delete cascade,
  room_id      uuid not null references public.rooms (id) on delete cascade,  -- for realtime filtering
  idx          int not null,
  question_id  int not null references public.couple_questions (id),
  -- Who has answered (so the app can say "Waiting for …" without revealing the answer).
  x_answered   boolean not null default false,
  o_answered   boolean not null default false,
  revealed_at  timestamptz,
  unique (session_id, idx)
);
create index couple_rounds_room_idx on public.couple_rounds (room_id);

create table public.couple_answers (
  round_id      uuid not null references public.couple_rounds (id) on delete cascade,
  player_id     uuid not null references public.players (id) on delete cascade,
  self_answer   smallint,  -- compatibility: option index for "about me"
  guess_answer  smallint,  -- compatibility: option index for "my partner would say"
  text_answer   text,      -- memories (stage 4)
  created_at    timestamptz not null default now(),
  primary key (round_id, player_id)
);

-- Which questions a pair has already seen (rotation). Pair stored in a fixed order.
create table public.couple_question_usage (
  user_a       uuid not null references public.players (id) on delete cascade,
  user_b       uuid not null references public.players (id) on delete cascade,
  question_id  int not null references public.couple_questions (id) on delete cascade,
  used_at      timestamptz not null default now(),
  primary key (user_a, user_b, question_id),
  check (user_a < user_b)
);

-- ---------------------------------------------------------------------------
-- RLS: everything is private to the two players of the room.
-- ---------------------------------------------------------------------------
alter table public.couple_questions enable row level security;
alter table public.couple_sessions enable row level security;
alter table public.couple_rounds enable row level security;
alter table public.couple_answers enable row level security;
alter table public.couple_question_usage enable row level security;

create policy "couple_questions: signed-in read" on public.couple_questions
  for select to authenticated using (active);

create policy "couple_sessions: room members read" on public.couple_sessions
  for select to authenticated
  using (exists (select 1 from public.rooms r where r.id = couple_sessions.room_id and (select auth.uid()) in (r.player_x, r.player_o)));

create policy "couple_rounds: room members read" on public.couple_rounds
  for select to authenticated
  using (exists (select 1 from public.rooms r where r.id = couple_rounds.room_id and (select auth.uid()) in (r.player_x, r.player_o)));

-- Your own answers always; your partner's only once the round is revealed (both have answered).
create policy "couple_answers: own, or partner's after reveal" on public.couple_answers
  for select to authenticated
  using (
    exists (
      select 1 from public.couple_rounds cr join public.rooms r on r.id = cr.room_id
       where cr.id = couple_answers.round_id
         and (select auth.uid()) in (r.player_x, r.player_o)
         and (couple_answers.player_id = (select auth.uid()) or cr.revealed_at is not null)
    )
  );

revoke all on public.couple_questions, public.couple_sessions, public.couple_rounds, public.couple_answers, public.couple_question_usage from anon;
revoke insert, update, delete on public.couple_questions, public.couple_sessions, public.couple_rounds, public.couple_answers from authenticated;
revoke all on public.couple_question_usage from authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The caller's couple room (locked), or an error.
create or replace function public._couple_room(p_room_id uuid)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
begin
  select * into r from public.rooms where id = p_room_id for update;
  if not found or auth.uid() is null or auth.uid() not in (r.player_x, coalesce(r.player_o, r.player_x)) then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if r.game_type <> 'couple' then raise exception 'ROOM_NOT_FOUND'; end if;
  if r.status <> 'playing' or r.player_o is null then raise exception 'ROOM_NOT_ACTIVE'; end if;
  if public._is_blocked(r.player_x, r.player_o) then raise exception 'BLOCKED'; end if;
  return r;
end;
$$;

-- Compatibility % from correct guesses: (X's correct + O's correct) / (2 × questions).
create or replace function public._compat_pct(p_x_correct int, p_o_correct int, p_total int)
returns int language sql immutable set search_path = '' as $$
  select case when coalesce(p_total, 0) <= 0 then 0
              else least(100, greatest(0, round(100.0 * (p_x_correct + p_o_correct) / (2 * p_total))))::int end;
$$;

create or replace function public._compat_title(p_pct int)
returns text language sql immutable set search_path = '' as $$
  select case when p_pct >= 75 then 'soulmates' when p_pct >= 45 then 'perfect_chaos' else 'still_learning' end;
$$;

-- Picks n questions the pair hasn't seen. When the category runs out, it starts a new cycle
-- (forgets that category's history) and tops up, without repeating questions within this pick.
create or replace function public._pick_questions(p_a uuid, p_b uuid, p_mode text, p_category text, p_n int)
returns int[] language plpgsql security definer set search_path = '' as $$
declare
  lo uuid := least(p_a, p_b);
  hi uuid := greatest(p_a, p_b);
  picked int[];
  extra int[];
begin
  select coalesce(array_agg(id), '{}') into picked from (
    select q.id from public.couple_questions q
     where q.active and q.mode = p_mode and (p_category is null or q.category = p_category)
       and not exists (select 1 from public.couple_question_usage u
                        where u.user_a = lo and u.user_b = hi and u.question_id = q.id)
     order by random() limit p_n
  ) s;

  if cardinality(picked) < p_n then
    delete from public.couple_question_usage u
     using public.couple_questions q
     where u.question_id = q.id and u.user_a = lo and u.user_b = hi
       and q.mode = p_mode and (p_category is null or q.category = p_category);
    select coalesce(array_agg(id), '{}') into extra from (
      select q.id from public.couple_questions q
       where q.active and q.mode = p_mode and (p_category is null or q.category = p_category)
         and not (q.id = any (picked))
       order by random() limit p_n - cardinality(picked)
    ) s;
    picked := picked || extra;
  end if;

  insert into public.couple_question_usage (user_a, user_b, question_id)
  select lo, hi, unnest(picked) on conflict do nothing;
  return picked;
end;
$$;

-- Scores a finished Compatibility Test (server-side) and closes the session.
create or replace function public._finish_compat(p_session_id uuid)
returns public.couple_sessions language plpgsql security definer set search_path = '' as $$
declare
  s public.couple_sessions;
  r public.rooms;
  xc int;
  oc int;
  same int;
  pct int;
begin
  select * into s from public.couple_sessions where id = p_session_id;
  select * into r from public.rooms where id = s.room_id;
  select count(*) filter (where ax.guess_answer = ao.self_answer),
         count(*) filter (where ao.guess_answer = ax.self_answer),
         count(*) filter (where ax.self_answer = ao.self_answer)
    into xc, oc, same
    from public.couple_rounds cr
    left join public.couple_answers ax on ax.round_id = cr.id and ax.player_id = r.player_x
    left join public.couple_answers ao on ao.round_id = cr.id and ao.player_id = r.player_o
   where cr.session_id = s.id;
  pct := public._compat_pct(xc, oc, s.total_rounds);
  update public.couple_sessions
     set status = 'finished', ended_at = now(), compat_pct = pct, points = 10 * (xc + oc),
         result = jsonb_build_object('x_correct', xc, 'o_correct', oc, 'same_answers', same, 'title', public._compat_title(pct))
   where id = s.id
  returning * into s;
  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- Game actions
-- ---------------------------------------------------------------------------

-- Starts a session (10 questions from a category). If one is already running, returns it,
-- so both players tapping Start at once is harmless.
create or replace function public.start_session(p_room_id uuid, p_mode text, p_category text)
returns public.couple_sessions language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms := public._couple_room(p_room_id);
  s public.couple_sessions;
  qs int[];
begin
  select * into s from public.couple_sessions where room_id = r.id and status = 'active';
  if found then return s; end if;

  if p_mode is distinct from 'compatibility' then raise exception 'MODE_NOT_AVAILABLE'; end if;
  if not exists (select 1 from public.couple_questions where active and mode = p_mode and category = p_category) then
    raise exception 'INVALID_CATEGORY';
  end if;

  qs := public._pick_questions(r.player_x, r.player_o, p_mode, p_category, 10);
  insert into public.couple_sessions (room_id, mode, category, started_by, total_rounds)
  values (r.id, p_mode, p_category, auth.uid(), cardinality(qs))
  returning * into s;
  insert into public.couple_rounds (session_id, room_id, idx, question_id)
  select s.id, r.id, i, qs[i] from generate_subscripts(qs, 1) i;
  return s;
end;
$$;

-- Saves my two picks for the current round (I can change them until the round is revealed).
-- When both players have answered, the round is revealed.
create or replace function public.submit_answer(p_round_id uuid, p_self int, p_guess int)
returns public.couple_rounds language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cr public.couple_rounds;
  s public.couple_sessions;
  r public.rooms;
  n int;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into cr from public.couple_rounds where id = p_round_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  select * into r from public.rooms where id = cr.room_id;
  if uid not in (r.player_x, coalesce(r.player_o, r.player_x)) then raise exception 'ROUND_NOT_FOUND'; end if;
  select * into s from public.couple_sessions where id = cr.session_id;
  if s.status <> 'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;
  if cr.idx <> s.current_round then raise exception 'ROUND_NOT_CURRENT'; end if;
  if cr.revealed_at is not null then raise exception 'ROUND_REVEALED'; end if;
  if public._is_blocked(r.player_x, r.player_o) then raise exception 'BLOCKED'; end if;

  select jsonb_array_length(options) into n from public.couple_questions where id = cr.question_id;
  if p_self is null or p_guess is null or p_self not between 0 and n - 1 or p_guess not between 0 and n - 1 then
    raise exception 'INVALID_ANSWER';
  end if;

  insert into public.couple_answers (round_id, player_id, self_answer, guess_answer)
  values (cr.id, uid, p_self, p_guess)
  on conflict (round_id, player_id) do update
    set self_answer = excluded.self_answer, guess_answer = excluded.guess_answer, created_at = now();

  update public.couple_rounds
     set x_answered = x_answered or uid = r.player_x,
         o_answered = o_answered or uid = r.player_o
   where id = cr.id
  returning * into cr;
  if cr.x_answered and cr.o_answered then
    update public.couple_rounds set revealed_at = now() where id = cr.id returning * into cr;
  end if;
  return cr;
end;
$$;

-- Reveals a round once both have answered (submit_answer already does this; safe to call again).
create or replace function public.reveal_round(p_round_id uuid)
returns public.couple_rounds language plpgsql security definer set search_path = '' as $$
declare
  cr public.couple_rounds;
  r public.rooms;
begin
  select * into cr from public.couple_rounds where id = p_round_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  select * into r from public.rooms where id = cr.room_id;
  if auth.uid() is null or auth.uid() not in (r.player_x, coalesce(r.player_o, r.player_x)) then raise exception 'ROUND_NOT_FOUND'; end if;
  if cr.revealed_at is null and cr.x_answered and cr.o_answered then
    update public.couple_rounds set revealed_at = now() where id = cr.id returning * into cr;
  end if;
  return cr;
end;
$$;

-- Moves on from round p_from_idx (either player can tap Next; a second tap is a no-op).
-- After the last round, the session is scored and finished.
create or replace function public.next_round(p_session_id uuid, p_from_idx int)
returns public.couple_sessions language plpgsql security definer set search_path = '' as $$
declare
  s public.couple_sessions;
  r public.rooms;
  revealed boolean;
begin
  select * into s from public.couple_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  select * into r from public.rooms where id = s.room_id;
  if auth.uid() is null or auth.uid() not in (r.player_x, coalesce(r.player_o, r.player_x)) then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status <> 'active' or s.current_round <> p_from_idx then return s; end if;

  select revealed_at is not null into revealed from public.couple_rounds where session_id = s.id and idx = s.current_round;
  if not revealed then raise exception 'ROUND_NOT_REVEALED'; end if;

  if s.current_round < s.total_rounds then
    update public.couple_sessions set current_round = current_round + 1 where id = s.id returning * into s;
    return s;
  end if;
  return public._finish_compat(s.id);
end;
$$;

-- Ends a session early (back to the lobby).
create or replace function public.quit_session(p_session_id uuid)
returns public.couple_sessions language plpgsql security definer set search_path = '' as $$
declare
  s public.couple_sessions;
  r public.rooms;
begin
  select * into s from public.couple_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  select * into r from public.rooms where id = s.room_id;
  if auth.uid() is null or auth.uid() not in (r.player_x, coalesce(r.player_o, r.player_x)) then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status = 'active' then
    update public.couple_sessions set status = 'abandoned', ended_at = now() where id = s.id returning * into s;
  end if;
  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants & realtime
-- ---------------------------------------------------------------------------
revoke execute on function public._couple_room(uuid)                               from public, anon, authenticated;
revoke execute on function public._pick_questions(uuid, uuid, text, text, int)     from public, anon, authenticated;
revoke execute on function public._finish_compat(uuid)                             from public, anon, authenticated;
revoke execute on function public._compat_pct(int, int, int)                       from public, anon;
revoke execute on function public._compat_title(int)                               from public, anon;

revoke execute on function public.start_session(uuid, text, text)   from public, anon;
revoke execute on function public.submit_answer(uuid, int, int)     from public, anon;
revoke execute on function public.reveal_round(uuid)                from public, anon;
revoke execute on function public.next_round(uuid, int)             from public, anon;
revoke execute on function public.quit_session(uuid)                from public, anon;
grant  execute on function public.start_session(uuid, text, text)   to authenticated;
grant  execute on function public.submit_answer(uuid, int, int)     to authenticated;
grant  execute on function public.reveal_round(uuid)                to authenticated;
grant  execute on function public.next_round(uuid, int)             to authenticated;
grant  execute on function public.quit_session(uuid)                to authenticated;

alter publication supabase_realtime add table public.couple_sessions, public.couple_rounds;
