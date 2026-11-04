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
