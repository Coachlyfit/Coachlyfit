-- coach_id nullable: null = platform-curated global entry, visible to every
-- coach; non-null = one coach's private addition, visible only to them.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references public.coaches (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  muscle_group text,
  equipment text,
  instructions_ar text,
  instructions_en text,
  video_url text,
  created_at timestamptz not null default now()
);

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references public.coaches (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  serving_label text not null default '100g',
  kcal numeric not null,
  protein_g numeric not null default 0,
  carb_g numeric not null default 0,
  fat_g numeric not null default 0,
  created_at timestamptz not null default now()
);

create index exercises_coach_id_idx on public.exercises (coach_id);
create index foods_coach_id_idx on public.foods (coach_id);

-- Bilingual trigram search: one query searches both name columns at once,
-- regardless of which script the coach types in.
create index exercises_search_idx on public.exercises
  using gin ((coalesce(name_ar, '') || ' ' || coalesce(name_en, '')) extensions.gin_trgm_ops);
create index foods_search_idx on public.foods
  using gin ((coalesce(name_ar, '') || ' ' || coalesce(name_en, '')) extensions.gin_trgm_ops);

alter table public.exercises enable row level security;
alter table public.foods enable row level security;

-- Read: your own rows plus every global row — tenant_id() so a CLIENT can
-- also see their coach's custom library (needed to view assigned plans),
-- not just the coach themself. Write: coach_id() (strict, coach-only) so a
-- client whose tenant matches still can't write into it.
create policy read_own_and_global on public.exercises
  for select to authenticated
  using (coach_id is null or coach_id = (select private.tenant_id()));
create policy write_own on public.exercises
  for insert to authenticated
  with check (coach_id = (select private.coach_id()));
create policy update_own on public.exercises
  for update to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));
create policy delete_own on public.exercises
  for delete to authenticated
  using (coach_id = (select private.coach_id()));

create policy read_own_and_global on public.foods
  for select to authenticated
  using (coach_id is null or coach_id = (select private.tenant_id()));
create policy write_own on public.foods
  for insert to authenticated
  with check (coach_id = (select private.coach_id()));
create policy update_own on public.foods
  for update to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));
create policy delete_own on public.foods
  for delete to authenticated
  using (coach_id = (select private.coach_id()));

-- Global (coach_id is null) rows are admin-curated: only a platform admin
-- can write them, enforced by NOT letting coach write_own's `with check`
-- match a null coach_id (it can't — see above), plus an explicit admin path.
create policy admin_write_global on public.exercises
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());
create policy admin_write_global on public.foods
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

grant select, insert, update, delete on public.exercises to authenticated;
grant select, insert, update, delete on public.foods to authenticated;
grant select, insert, update, delete on public.exercises to service_role;
grant select, insert, update, delete on public.foods to service_role;
