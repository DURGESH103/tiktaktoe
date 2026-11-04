-- Couple Challenge, stage 3: the Questions deck (Fun → Deep → Future) and Challenges.

-- Challenges have a timer; tasks that mention a length use it, the rest get 60 s.
alter table public.couple_questions add column duration_secs int check (duration_secs between 5 and 600);
update public.couple_questions
   set duration_secs = case when text_en ~* '\m20[- ]second' then 20
                            when text_en ~* '\m30[- ]second' then 30
                            else 60 end
 where mode = 'challenges';

-- Challenge state per round. The performer alternates: odd rounds X, even rounds O.
--   claimed   = performer tapped Done, waiting for the partner to confirm
--   completed = partner confirmed (+15 points) · failed = partner said "not quite" · skipped
alter table public.couple_rounds
  add column timer_started_at timestamptz,
  add column outcome text check (outcome in ('claimed', 'completed', 'failed', 'skipped'));

-- ---------------------------------------------------------------------------
-- start_session: same signature as 0010; now also starts the Questions deck and Challenges.
-- ---------------------------------------------------------------------------
create or replace function public.start_session(p_room_id uuid, p_mode text, p_category text)
returns public.couple_sessions language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms := public._couple_room(p_room_id);
  s public.couple_sessions;
  qs int[];
  cat text := p_category;
begin
  select * into s from public.couple_sessions where room_id = r.id and status = 'active';
  if found then return s; end if;

  if p_mode = 'compatibility' then
    if not exists (select 1 from public.couple_questions where active and mode = p_mode and category = p_category) then
      raise exception 'INVALID_CATEGORY';
    end if;
    qs := public._pick_questions(r.player_x, r.player_o, 'compatibility', p_category, 10);
  elsif p_mode = 'questions' then
    -- 4 cards per level, in order: Fun, then Deep, then Future.
    qs := public._pick_questions(r.player_x, r.player_o, 'questions', 'fun', 4)
       || public._pick_questions(r.player_x, r.player_o, 'questions', 'deep', 4)
       || public._pick_questions(r.player_x, r.player_o, 'questions', 'future', 4);
    cat := 'all';
  elsif p_mode = 'challenges' then
    qs := public._pick_questions(r.player_x, r.player_o, 'challenges', 'challenges', 5);
    cat := 'challenges';
  else
    raise exception 'MODE_NOT_AVAILABLE';
  end if;

  insert into public.couple_sessions (room_id, mode, category, started_by, total_rounds)
  values (r.id, p_mode, cat, auth.uid(), cardinality(qs))
  returning * into s;
  insert into public.couple_rounds (session_id, room_id, idx, question_id)
  select s.id, r.id, i, qs[i] from generate_subscripts(qs, 1) i;
  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Consecutive completed challenges for a pair, most recent first, across all their sessions.
-- A skip or "not quite" ends the run.
create or replace function public._challenge_streak(p_a uuid, p_b uuid)
returns int language sql stable security definer set search_path = '' as $$
  with rs as (
    select cr.outcome, row_number() over (order by s.started_at desc, cr.idx desc) as rn
      from public.couple_rounds cr
      join public.couple_sessions s on s.id = cr.session_id
      join public.rooms r on r.id = s.room_id
     where s.mode = 'challenges'
       and least(r.player_x, r.player_o) = least(p_a, p_b)
       and greatest(r.player_x, r.player_o) = greatest(p_a, p_b)
       and cr.outcome in ('completed', 'failed', 'skipped')
  )
  select coalesce((select min(rn) - 1 from rs where outcome <> 'completed'), (select count(*) from rs))::int;
$$;

-- Loads a round for an action and checks: caller is a member, session active, round is current.
create or replace function public._current_round(p_round_id uuid)
returns public.couple_rounds language plpgsql security definer set search_path = '' as $$
declare
  cr public.couple_rounds;
  s public.couple_sessions;
  r public.rooms;
begin
  select * into cr from public.couple_rounds where id = p_round_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  select * into r from public.rooms where id = cr.room_id;
  if auth.uid() is null or auth.uid() not in (r.player_x, coalesce(r.player_o, r.player_x)) then raise exception 'ROUND_NOT_FOUND'; end if;
  select * into s from public.couple_sessions where id = cr.session_id;
  if s.status <> 'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;
  if cr.idx <> s.current_round then raise exception 'ROUND_NOT_CURRENT'; end if;
  if public._is_blocked(r.player_x, r.player_o) then raise exception 'BLOCKED'; end if;
  return cr;
end;
$$;

-- Who performs a challenge round: odd rounds player X, even rounds player O.
create or replace function public._performer(r public.rooms, p_idx int)
returns uuid language sql immutable set search_path = '' as $$
  select case when p_idx % 2 = 1 then r.player_x else r.player_o end;
$$;

-- Closes a Questions or Challenges session with its summary.
create or replace function public._finish_session(p_session_id uuid)
returns public.couple_sessions language plpgsql security definer set search_path = '' as $$
declare
  s public.couple_sessions;
  r public.rooms;
begin
  select * into s from public.couple_sessions where id = p_session_id;
  select * into r from public.rooms where id = s.room_id;
  if s.mode = 'challenges' then
    update public.couple_sessions
       set status = 'finished', ended_at = now(),
           result = (select jsonb_build_object(
                       'completed', count(*) filter (where outcome = 'completed'),
                       'failed', count(*) filter (where outcome = 'failed'),
                       'skipped', count(*) filter (where outcome = 'skipped'),
                       'streak', public._challenge_streak(r.player_x, r.player_o))
                     from public.couple_rounds where session_id = s.id)
     where id = s.id returning * into s;
  else
    update public.couple_sessions
       set status = 'finished', ended_at = now(), result = jsonb_build_object('cards', s.total_rounds)
     where id = s.id returning * into s;
  end if;
  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------

-- Draws the next card (Questions) or moves to the next task (Challenges, once resolved).
-- Either player can tap it; a second tap for the same card is a no-op.
create or replace function public.next_card(p_session_id uuid, p_from_idx int)
returns public.couple_sessions language plpgsql security definer set search_path = '' as $$
declare
  s public.couple_sessions;
  r public.rooms;
  outcome text;
begin
  select * into s from public.couple_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  select * into r from public.rooms where id = s.room_id;
  if auth.uid() is null or auth.uid() not in (r.player_x, coalesce(r.player_o, r.player_x)) then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.mode not in ('questions', 'challenges') then raise exception 'MODE_NOT_AVAILABLE'; end if;
  if s.status <> 'active' or s.current_round <> p_from_idx then return s; end if;

  if s.mode = 'challenges' then
    select cr.outcome into outcome from public.couple_rounds cr where cr.session_id = s.id and cr.idx = s.current_round;
    if outcome is null or outcome = 'claimed' then raise exception 'CHALLENGE_NOT_RESOLVED'; end if;
  end if;

  if s.current_round < s.total_rounds then
    update public.couple_sessions set current_round = current_round + 1 where id = s.id returning * into s;
    return s;
  end if;
  return public._finish_session(s.id);
end;
$$;

-- Performer starts the countdown.
create or replace function public.start_challenge_timer(p_round_id uuid)
returns public.couple_rounds language plpgsql security definer set search_path = '' as $$
declare
  cr public.couple_rounds;
  s public.couple_sessions;
  r public.rooms;
begin
  cr := public._current_round(p_round_id);
  select * into s from public.couple_sessions where id = cr.session_id;
  select * into r from public.rooms where id = cr.room_id;
  if s.mode <> 'challenges' then raise exception 'MODE_NOT_AVAILABLE'; end if;
  if auth.uid() <> public._performer(r, cr.idx) then raise exception 'NOT_YOUR_CHALLENGE'; end if;
  if cr.outcome is not null then raise exception 'CHALLENGE_ALREADY_DONE'; end if;
  if cr.timer_started_at is null then
    update public.couple_rounds set timer_started_at = now() where id = cr.id returning * into cr;
  end if;
  return cr;
end;
$$;

-- Performer: Done (→ partner confirms) or Skip.
create or replace function public.complete_challenge(p_round_id uuid, p_done boolean)
returns public.couple_rounds language plpgsql security definer set search_path = '' as $$
declare
  cr public.couple_rounds;
  s public.couple_sessions;
  r public.rooms;
begin
  cr := public._current_round(p_round_id);
  select * into s from public.couple_sessions where id = cr.session_id;
  select * into r from public.rooms where id = cr.room_id;
  if s.mode <> 'challenges' then raise exception 'MODE_NOT_AVAILABLE'; end if;
  if auth.uid() <> public._performer(r, cr.idx) then raise exception 'NOT_YOUR_CHALLENGE'; end if;
  if cr.outcome is not null then raise exception 'CHALLENGE_ALREADY_DONE'; end if;
  update public.couple_rounds
     set outcome = case when p_done then 'claimed' else 'skipped' end
   where id = cr.id returning * into cr;
  return cr;
end;
$$;

-- Partner confirms the performer really did it (+15 points), or not.
create or replace function public.confirm_challenge(p_round_id uuid, p_ok boolean)
returns public.couple_rounds language plpgsql security definer set search_path = '' as $$
declare
  cr public.couple_rounds;
  s public.couple_sessions;
  r public.rooms;
begin
  cr := public._current_round(p_round_id);
  select * into s from public.couple_sessions where id = cr.session_id;
  select * into r from public.rooms where id = cr.room_id;
  if s.mode <> 'challenges' then raise exception 'MODE_NOT_AVAILABLE'; end if;
  if auth.uid() = public._performer(r, cr.idx) then raise exception 'PARTNER_MUST_CONFIRM'; end if;
  if cr.outcome is distinct from 'claimed' then raise exception 'NOTHING_TO_CONFIRM'; end if;
  update public.couple_rounds set outcome = case when p_ok then 'completed' else 'failed' end where id = cr.id returning * into cr;
  if p_ok then
    update public.couple_sessions set points = points + 15 where id = cr.session_id;
  end if;
  return cr;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public._challenge_streak(uuid, uuid)          from public, anon, authenticated;
revoke execute on function public._current_round(uuid)                   from public, anon, authenticated;
revoke execute on function public._finish_session(uuid)                  from public, anon, authenticated;
revoke execute on function public._performer(public.rooms, int)          from public, anon, authenticated;

revoke execute on function public.next_card(uuid, int)                   from public, anon;
revoke execute on function public.start_challenge_timer(uuid)            from public, anon;
revoke execute on function public.complete_challenge(uuid, boolean)      from public, anon;
revoke execute on function public.confirm_challenge(uuid, boolean)       from public, anon;
grant  execute on function public.next_card(uuid, int)                   to authenticated;
grant  execute on function public.start_challenge_timer(uuid)            to authenticated;
grant  execute on function public.complete_challenge(uuid, boolean)      to authenticated;
grant  execute on function public.confirm_challenge(uuid, boolean)       to authenticated;
