-- The original client_insert_own policy (20260731000007_forms.sql) only
-- checked client_id, not coach_id — a client could submit with an
-- arbitrary coach_id, silently misfiling their own submission somewhere
-- their real coach's review list would never look. coach_id must match the
-- client's actual tenant too.
drop policy client_insert_own on public.form_submissions;

create policy client_insert_own on public.form_submissions
  for insert to authenticated
  with check (
    client_id = (select private.client_id())
    and coach_id = (select private.tenant_id())
  );
