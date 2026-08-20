-- A client needs to see their own coach's business_name (client home page,
-- "You're training with X"), but coaches_select_own (20260731000003) only
-- covers the coach reading their own row. tenant_id() resolves to the same
-- coach id for a client, so this grants read of exactly that one row —
-- never another coach's.
create policy client_read_own_coach on public.coaches
  for select to authenticated
  using (id = (select private.tenant_id()));
