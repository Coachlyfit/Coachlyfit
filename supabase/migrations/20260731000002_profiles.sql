-- Identity: one profile row per auth.users row, carrying the role that
-- everything else in the schema keys off of.
create type public.user_role as enum ('admin', 'coach', 'client');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'coach',
  full_name text,
  phone text,
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Every authenticated user may read and update their own profile row.
-- Role itself is never client-writable (see revoke below) — role changes
-- only happen server-side (signup trigger, accept_invite, admin tooling).
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- RLS restricts which rows; grants restrict which operations/columns.
-- New tables have no privileges for the authenticated/anon roles PostgREST
-- connects as until granted explicitly (Postgres default, not a Supabase
-- dashboard default-privilege exception, since these tables are created via
-- migration rather than the dashboard UI).
grant select, update on public.profiles to authenticated;
revoke update (role) on public.profiles from authenticated;
-- service_role bypasses RLS but still needs the underlying table grant —
-- used by the cron lifecycle route and (in tests) to set up fixtures.
grant select, insert, update, delete on public.profiles to service_role;
