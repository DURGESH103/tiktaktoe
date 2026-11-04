-- Stream row changes to subscribed clients. Realtime applies the RLS select
-- policies, so each client only receives rows for rooms they belong to.
alter publication supabase_realtime add table public.rooms, public.games;
