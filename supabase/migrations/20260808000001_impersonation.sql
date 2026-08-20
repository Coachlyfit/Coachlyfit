-- Admin "impersonate a coach" — a real session takeover for support/debug,
-- not a read-only view. The dangerous part (minting a session as someone
-- else) has to happen through Supabase's Auth Admin API, which only the
-- service-role client can call — src/lib/supabase/admin.ts says that client
-- should never run in a normal request path. This function is how the
-- authorization decision still lives in Postgres instead of app code, same
-- shape as admin_promote_exercise/_food: the server action calls this FIRST,
-- using the caller's own (non-service-role) session, and only reaches for
-- the service-role client afterward if this doesn't raise. It also writes
-- the audit row atomically with the check — there's no path that logs an
-- attempt without also having verified it.
create table public.impersonation_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index impersonation_log_coach_id_idx on public.impersonation_log (coach_id);
create index impersonation_log_admin_id_idx on public.impersonation_log (admin_id);

alter table public.impersonation_log enable row level security;

create policy admin_read on public.impersonation_log
  for select to authenticated
  using ((select private.is_admin()));

-- No insert policy for `authenticated` on purpose, same rule as
-- notifications (20260801000015_library_source.sql) — the only writer is
-- begin_impersonation below.
grant select on public.impersonation_log to authenticated;
grant select, insert on public.impersonation_log to service_role;

create function public.begin_impersonation(p_coach_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.coaches where id = p_coach_id) then
    raise exception 'Coach not found.' using errcode = '22023';
  end if;

  insert into public.impersonation_log (admin_id, coach_id)
  values ((select auth.uid()), p_coach_id);
end;
$$;

revoke execute on function public.begin_impersonation(uuid) from public;
grant execute on function public.begin_impersonation(uuid) to authenticated;
