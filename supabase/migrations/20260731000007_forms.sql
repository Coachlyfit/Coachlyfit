-- The forms builder's storage: a template (identity + current pointer) and
-- its immutable, versioned bodies. A submission snapshots by REFERENCE to
-- one version — no JSON duplication, and an edited template never changes
-- how an old submission renders.
create table public.form_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  kind text not null check (kind in ('intake', 'workout', 'diet', 'checkin', 'custom')),
  name_ar text not null,
  name_en text not null,
  current_version_id uuid,
  created_at timestamptz not null default now()
);

create table public.form_template_versions (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized from form_templates so RLS policies here don't need a
  -- join, consistent with every other coach-scoped table in this schema.
  coach_id uuid not null references public.coaches (id) on delete cascade,
  template_id uuid not null references public.form_templates (id) on delete cascade,
  version int not null,
  schema jsonb not null check (jsonb_typeof(schema -> 'fields') = 'array'),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

alter table public.form_templates
  add constraint form_templates_current_version_fk
  foreign key (current_version_id) references public.form_template_versions (id);

create index form_templates_coach_id_idx on public.form_templates (coach_id);
create index form_template_versions_coach_id_idx on public.form_template_versions (coach_id);
create index form_template_versions_template_id_idx on public.form_template_versions (template_id);

-- Versions are immutable once written: editing a published template always
-- inserts a new version row rather than mutating an old one.
create function private.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'form_template_versions rows are immutable; insert a new version instead.';
end;
$$;

create trigger form_template_versions_immutable
  before update or delete on public.form_template_versions
  for each row execute function private.reject_mutation();

alter table public.form_templates enable row level security;
alter table public.form_template_versions enable row level security;

create policy tenant_read on public.form_templates
  for select to authenticated
  using (coach_id = (select private.tenant_id()));
create policy coach_write on public.form_templates
  for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));

create policy tenant_read on public.form_template_versions
  for select to authenticated
  using (coach_id = (select private.tenant_id()));
create policy coach_insert on public.form_template_versions
  for insert to authenticated
  with check (coach_id = (select private.coach_id()));

grant select, insert, update, delete on public.form_templates to authenticated;
grant select, insert on public.form_template_versions to authenticated;
grant select, insert, update, delete on public.form_templates to service_role;
grant select, insert, update, delete on public.form_template_versions to service_role;

-- Assigning a template (version-pinned) to a client.
create table public.form_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  template_version_id uuid not null references public.form_template_versions (id),
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz not null default now()
);

create index form_assignments_coach_id_idx on public.form_assignments (coach_id);
create index form_assignments_client_id_idx on public.form_assignments (client_id);

alter table public.form_assignments enable row level security;

create policy coach_rw on public.form_assignments
  for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));
create policy client_read_own on public.form_assignments
  for select to authenticated
  using (client_id = (select private.client_id()));

grant select, insert, update, delete on public.form_assignments to authenticated;
grant select, insert, update, delete on public.form_assignments to service_role;

-- A filled-in form. Snapshotted by reference to template_version_id, so
-- this row never needs to change even if the template is edited later.
create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  assignment_id uuid not null references public.form_assignments (id) on delete cascade,
  template_version_id uuid not null references public.form_template_versions (id),
  answers jsonb not null,
  submitted_at timestamptz not null default now()
);

create index form_submissions_coach_id_idx on public.form_submissions (coach_id);
create index form_submissions_client_id_idx on public.form_submissions (client_id);

alter table public.form_submissions enable row level security;

create policy coach_read on public.form_submissions
  for select to authenticated
  using (coach_id = (select private.coach_id()));
create policy client_own on public.form_submissions
  for select to authenticated
  using (client_id = (select private.client_id()));
create policy client_insert_own on public.form_submissions
  for insert to authenticated
  with check (client_id = (select private.client_id()));

grant select, insert on public.form_submissions to authenticated;
grant select, insert, update, delete on public.form_submissions to service_role;

-- A submission completes its assignment. Security definer because the
-- client who just inserted the submission has no UPDATE policy on
-- form_assignments (only the coach does) — this is the one narrow,
-- well-scoped exception, limited to flipping status on the exact
-- assignment_id the same statement just referenced.
create function private.complete_assignment_on_submit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.form_assignments
  set status = 'completed'
  where id = new.assignment_id;
  return new;
end;
$$;

create trigger form_submissions_complete_assignment
  after insert on public.form_submissions
  for each row execute function private.complete_assignment_on_submit();
