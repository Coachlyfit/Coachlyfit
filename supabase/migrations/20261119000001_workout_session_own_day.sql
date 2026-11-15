-- A client can only start a session on a program_day from their own plan.
-- The app already derives program_day_id from the client's own plan, but the
-- existing client_own policy only checked client_id, so a raw PostgREST
-- insert could point a session at another client's day. Restrictive and
-- insert-only: it is ANDed with client_own and leaves select/update alone.
create policy client_own_day_only on public.workout_sessions
  as restrictive
  for insert to authenticated
  with check (
    exists (
      select 1 from public.program_days d
      where d.id = program_day_id
        and d.client_id = (select private.client_id())
    )
  );
