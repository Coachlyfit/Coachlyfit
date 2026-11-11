-- Bulk import (clients, exercises) with undo. One `imports` row per run;
-- rows it created carry import_id so "Undo import" deletes exactly those.
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  type text not null check (type in ('clients', 'exercises')),
  imported_count int not null default 0,
  skipped_count int not null default 0,
  failed_count int not null default 0,
  created_at timestamptz not null default now()
);

create index imports_coach_id_idx on public.imports (coach_id);

alter table public.imports enable row level security;

create policy coach_rw on public.imports
  for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));

-- Same lapsed-subscription guard as the other coach-owned tables
-- (20261017000002_coach_access_guard.sql).
create policy coach_access_insert on public.imports as restrictive for insert to authenticated
  with check ((select private.coach_id()) is null
              or (select private.coach_has_access((select private.coach_id()))));
create policy coach_access_update on public.imports as restrictive for update to authenticated
  with check ((select private.coach_id()) is null
              or (select private.coach_has_access((select private.coach_id()))));

grant select, insert, update, delete on public.imports to authenticated;
grant select, insert, update, delete on public.imports to service_role;

-- on delete set null: removing an imports row never cascades into real data.
alter table public.clients
  add column import_id uuid references public.imports (id) on delete set null;
alter table public.exercises
  add column import_id uuid references public.imports (id) on delete set null;

create index clients_import_id_idx on public.clients (import_id) where import_id is not null;
create index exercises_import_id_idx on public.exercises (import_id) where import_id is not null;
