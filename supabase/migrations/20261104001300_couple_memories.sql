-- Couple Challenge, stage 4: Memories (write → compare → "We matched" vote) and the shared
-- "Our Memories" timeline with optional private photos. Tic-Tac-Toe is not touched.

-- ---------------------------------------------------------------------------
-- Rounds: each player's "we matched" vote, and two new outcomes.
-- ---------------------------------------------------------------------------
alter table public.couple_rounds
  add column x_match boolean,
  add column o_match boolean;
alter table public.couple_rounds drop constraint if exists couple_rounds_outcome_check;
alter table public.couple_rounds
  add constraint couple_rounds_outcome_check
  check (outcome in ('claimed', 'completed', 'failed', 'skipped', 'matched', 'different'));

-- ---------------------------------------------------------------------------
-- start_session: same signature and behaviour for the other modes, plus Memories (5 prompts).
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
    qs := public._pick_questions(r.player_x, r.player_o, 'questions', 'fun', 4)
       || public._pick_questions(r.player_x, r.player_o, 'questions', 'deep', 4)
       || public._pick_questions(r.player_x, r.player_o, 'questions', 'future', 4);
    cat := 'all';
  elsif p_mode = 'challenges' then
    qs := public._pick_questions(r.player_x, r.player_o, 'challenges', 'challenges', 5);
    cat := 'challenges';
  elsif p_mode = 'memories' then
    qs := public._pick_questions(r.player_x, r.player_o, 'memories', 'memories', 5);
    cat := 'memories';
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

-- _finish_session: adds the Memories summary ({ matched, different }).
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
  elsif s.mode = 'memories' then
    update public.couple_sessions
       set status = 'finished', ended_at = now(),
           result = (select jsonb_build_object(
                       'matched', count(*) filter (where outcome = 'matched'),
                       'different', count(*) filter (where outcome = 'different'))
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

-- next_card: Memories moves on only once both have voted.
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
  if s.mode not in ('questions', 'challenges', 'memories') then raise exception 'MODE_NOT_AVAILABLE'; end if;
  if s.status <> 'active' or s.current_round <> p_from_idx then return s; end if;

  select cr.outcome into outcome from public.couple_rounds cr where cr.session_id = s.id and cr.idx = s.current_round;
  if s.mode = 'challenges' and (outcome is null or outcome = 'claimed') then raise exception 'CHALLENGE_NOT_RESOLVED'; end if;
  if s.mode = 'memories' and outcome is null then raise exception 'MEMORY_NOT_RESOLVED'; end if;

  if s.current_round < s.total_rounds then
    update public.couple_sessions set current_round = current_round + 1 where id = s.id returning * into s;
    return s;
  end if;
  return public._finish_session(s.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Memories round actions
-- ---------------------------------------------------------------------------

-- Saves my written answer (editable until the reveal). Both answered → revealed.
create or replace function public.submit_memory_answer(p_round_id uuid, p_text text)
returns public.couple_rounds language plpgsql security definer set search_path = '' as $$
declare
  cr public.couple_rounds;
  s public.couple_sessions;
  r public.rooms;
  clean text;
begin
  cr := public._current_round(p_round_id);
  select * into s from public.couple_sessions where id = cr.session_id;
  select * into r from public.rooms where id = cr.room_id;
  if s.mode <> 'memories' then raise exception 'MODE_NOT_AVAILABLE'; end if;
  if cr.revealed_at is not null then raise exception 'ROUND_REVEALED'; end if;

  clean := btrim(regexp_replace(regexp_replace(coalesce(p_text, ''), '[\x00-\x1F\x7F]', ' ', 'g'), '\s+', ' ', 'g'));
  if clean = '' then raise exception 'MESSAGE_EMPTY'; end if;
  if char_length(clean) > 300 then raise exception 'MESSAGE_TOO_LONG'; end if;

  insert into public.couple_answers (round_id, player_id, text_answer)
  values (cr.id, auth.uid(), clean)
  on conflict (round_id, player_id) do update set text_answer = excluded.text_answer, created_at = now();

  update public.couple_rounds
     set x_answered = x_answered or auth.uid() = r.player_x,
         o_answered = o_answered or auth.uid() = r.player_o
   where id = cr.id
  returning * into cr;
  if cr.x_answered and cr.o_answered then
    update public.couple_rounds set revealed_at = now() where id = cr.id returning * into cr;
  end if;
  return cr;
end;
$$;

-- "We matched ✅" / "Different". Changeable until both have voted; both "matched" → +20 points.
create or replace function public.vote_memory_match(p_round_id uuid, p_matched boolean)
returns public.couple_rounds language plpgsql security definer set search_path = '' as $$
declare
  cr public.couple_rounds;
  s public.couple_sessions;
  r public.rooms;
begin
  cr := public._current_round(p_round_id);
  select * into s from public.couple_sessions where id = cr.session_id;
  select * into r from public.rooms where id = cr.room_id;
  if s.mode <> 'memories' then raise exception 'MODE_NOT_AVAILABLE'; end if;
  if cr.revealed_at is null then raise exception 'ROUND_NOT_REVEALED'; end if;
  if p_matched is null then raise exception 'INVALID_ANSWER'; end if;
  if cr.outcome is not null then return cr; end if;  -- already decided

  update public.couple_rounds
     set x_match = case when auth.uid() = r.player_x then p_matched else x_match end,
         o_match = case when auth.uid() = r.player_o then p_matched else o_match end
   where id = cr.id
  returning * into cr;
  if cr.x_match is not null and cr.o_match is not null then
    update public.couple_rounds
       set outcome = case when cr.x_match and cr.o_match then 'matched' else 'different' end
     where id = cr.id
    returning * into cr;
    if cr.outcome = 'matched' then
      update public.couple_sessions set points = points + 20 where id = cr.session_id;
    end if;
  end if;
  return cr;
end;
$$;

-- ---------------------------------------------------------------------------
-- "Our Memories" timeline: one per pair (follows them across rooms).
-- ---------------------------------------------------------------------------
create table public.couple_memories (
  id           uuid primary key default gen_random_uuid(),
  user_a       uuid not null references public.players (id) on delete cascade,
  user_b       uuid not null references public.players (id) on delete cascade,
  room_id      uuid references public.rooms (id) on delete set null,
  created_by   uuid not null references public.players (id) on delete cascade,
  question_id  int references public.couple_questions (id),
  title        text not null check (char_length(title) between 1 and 120),
  body         text not null check (char_length(body) between 1 and 500),
  -- Object path in the private "couple-memories" bucket: "<user_a>_<user_b>/<uuid>.<ext>".
  photo_path   text,
  created_at   timestamptz not null default now(),
  check (user_a < user_b),
  check (created_by in (user_a, user_b))
);
create index couple_memories_pair_idx on public.couple_memories (user_a, user_b, created_at desc);

-- Readable by the pair only, and not while one of them has blocked the other.
-- (Executable by signed-in users because RLS policies run as the caller.)
create or replace function public._memory_visible(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and auth.uid() in (p_a, p_b) and not public._is_blocked(p_a, p_b);
$$;

alter table public.couple_memories enable row level security;
create policy "couple_memories: the pair reads" on public.couple_memories
  for select to authenticated using (public._memory_visible(user_a, user_b));
revoke all on public.couple_memories from anon;
revoke insert, update, delete on public.couple_memories from authenticated;

-- Storage folder check for photos: "<user_a>_<user_b>" where the caller is one of the two,
-- they've played Couple Challenge together, and neither has blocked the other.
create or replace function public._can_access_memory_folder(p_folder text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  a uuid;
  b uuid;
begin
  if auth.uid() is null or coalesce(p_folder, '') !~ '^[0-9a-f-]{36}_[0-9a-f-]{36}$' then return false; end if;
  a := split_part(p_folder, '_', 1)::uuid;
  b := split_part(p_folder, '_', 2)::uuid;
  if a >= b or auth.uid() not in (a, b) or public._is_blocked(a, b) then return false; end if;
  return exists (select 1 from public.rooms
                  where game_type = 'couple' and least(player_x, player_o) = a and greatest(player_x, player_o) = b);
end;
$$;

-- Saves a memory to the pair's timeline. Only the two players of a live Couple room can save.
create or replace function public.save_memory(p_room_id uuid, p_title text, p_body text, p_photo_path text default null, p_question_id int default null)
returns public.couple_memories language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms := public._couple_room(p_room_id);
  lo uuid := least(r.player_x, r.player_o);
  hi uuid := greatest(r.player_x, r.player_o);
  t text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  b text := btrim(regexp_replace(regexp_replace(coalesce(p_body, ''), '[\x00-\x09\x0B-\x1F\x7F]', ' ', 'g'), '[ \t]+', ' ', 'g'));
  m public.couple_memories;
begin
  if t = '' or b = '' then raise exception 'MESSAGE_EMPTY'; end if;
  if char_length(t) > 120 or char_length(b) > 500 then raise exception 'MESSAGE_TOO_LONG'; end if;
  if p_photo_path is not null
     and p_photo_path !~ ('^' || lo::text || '_' || hi::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$') then
    raise exception 'INVALID_PHOTO';
  end if;
  if p_question_id is not null and not exists (select 1 from public.couple_questions where id = p_question_id and mode = 'memories') then
    raise exception 'INVALID_MESSAGE';
  end if;
  if (select count(*) from public.couple_memories where created_by = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.couple_memories (user_a, user_b, room_id, created_by, question_id, title, body, photo_path)
  values (lo, hi, r.id, auth.uid(), p_question_id, t, b, p_photo_path)
  returning * into m;
  return m;
end;
$$;

-- Deletes one of my memories. Returns its photo path so the app can remove the file too.
create or replace function public.delete_memory(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  m public.couple_memories;
begin
  select * into m from public.couple_memories where id = p_id for update;
  if not found or auth.uid() is null or m.created_by <> auth.uid() then raise exception 'MEMORY_NOT_FOUND'; end if;
  delete from public.couple_memories where id = m.id;
  return m.photo_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private photo bucket (Supabase Storage). Skipped where Storage isn't installed (local tests).
-- ---------------------------------------------------------------------------
do $do$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('couple-memories', 'couple-memories', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

  execute $p$
    create policy "couple memories: pair reads photos" on storage.objects
      for select to authenticated
      using (bucket_id = 'couple-memories' and public._can_access_memory_folder((storage.foldername(name))[1]))
  $p$;
  execute $p$
    create policy "couple memories: pair uploads photos" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'couple-memories' and public._can_access_memory_folder((storage.foldername(name))[1]))
  $p$;
  execute $p$
    create policy "couple memories: uploader deletes own photo" on storage.objects
      for delete to authenticated
      using (bucket_id = 'couple-memories' and owner_id = (select auth.uid())::text)
  $p$;
end;
$do$;

-- ---------------------------------------------------------------------------
-- Grants & realtime
-- ---------------------------------------------------------------------------
revoke execute on function public._memory_visible(uuid, uuid)          from public, anon;
revoke execute on function public._can_access_memory_folder(text)      from public, anon;
grant  execute on function public._memory_visible(uuid, uuid)          to authenticated;
grant  execute on function public._can_access_memory_folder(text)      to authenticated;

revoke execute on function public.submit_memory_answer(uuid, text)                  from public, anon;
revoke execute on function public.vote_memory_match(uuid, boolean)                  from public, anon;
revoke execute on function public.save_memory(uuid, text, text, text, int)          from public, anon;
revoke execute on function public.delete_memory(uuid)                               from public, anon;
grant  execute on function public.submit_memory_answer(uuid, text)                  to authenticated;
grant  execute on function public.vote_memory_match(uuid, boolean)                  to authenticated;
grant  execute on function public.save_memory(uuid, text, text, text, int)          to authenticated;
grant  execute on function public.delete_memory(uuid)                               to authenticated;

alter publication supabase_realtime add table public.couple_memories;
