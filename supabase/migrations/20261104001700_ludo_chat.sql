-- Ludo Stage 4: group chat. Same room_messages table and send_message RPC as Tic-Tac-Toe and Couple,
-- extended so every player seated at a Ludo table (room_players, not left) can read and send.
-- Tic-Tac-Toe / Couple behaviour is unchanged: their branch below is the 0007 definition, verbatim.

-- Extra read policy (policies are OR'd, the existing player_x/player_o one stays as is).
drop policy if exists "room_messages: ludo members read" on public.room_messages;
create policy "room_messages: ludo members read"
  on public.room_messages for select to authenticated
  using (
    exists (
      select 1 from public.room_players rp
      where rp.room_id = room_messages.room_id
        and rp.player_id = (select auth.uid())
        and rp.left_at is null
    )
  );

create or replace function public.send_message(p_room_id uuid, p_body text, p_client_id uuid)
returns public.room_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.rooms;
  clean text;
  result public.room_messages;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_client_id is null then
    raise exception 'INVALID_MESSAGE';
  end if;

  select * into r from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if r.game_type = 'ludo' then
    -- Seated players only (joining already refuses anyone blocked by someone at the table).
    if not exists (select 1 from public.room_players rp
                    where rp.room_id = r.id and rp.player_id = uid and rp.left_at is null) then
      raise exception 'ROOM_NOT_FOUND';
    end if;
  elsif uid not in (r.player_x, coalesce(r.player_o, r.player_x)) then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into result from public.room_messages where sender_id = uid and client_id = p_client_id;
  if found then
    return result;
  end if;

  if r.status = 'abandoned' then
    raise exception 'ROOM_CLOSED';
  end if;
  if r.game_type <> 'ludo' and r.player_o is not null and public._is_blocked(r.player_x, r.player_o) then
    raise exception 'BLOCKED';
  end if;

  clean := btrim(regexp_replace(regexp_replace(coalesce(p_body, ''), '[\x00-\x1F\x7F]', ' ', 'g'), '\s+', ' ', 'g'));
  if clean = '' then
    raise exception 'MESSAGE_EMPTY';
  end if;
  if char_length(clean) > 200 then
    raise exception 'MESSAGE_TOO_LONG';
  end if;

  if (select count(*) from public.room_messages
       where sender_id = uid and room_id = r.id and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.room_messages (room_id, sender_id, body, client_id)
  values (r.id, uid, clean, p_client_id)
  returning * into result;
  return result;
end;
$$;

revoke execute on function public.send_message(uuid, text, uuid) from public, anon;
grant  execute on function public.send_message(uuid, text, uuid) to authenticated;
