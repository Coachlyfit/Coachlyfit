-- Exercise alternatives + swap reason.
--
-- 1. exercise_alternatives: coach-curated substitutes for an exercise.
--    * program_item_id is null  -> library-level alternative for `exercise_id`.
--      coach_id null  = platform-level (admin-managed, readable by everyone);
--      coach_id set   = that coach's own list (readable by the coach + clients).
--    * program_item_id is set   -> override for one program item (one client's
--      program). When an item has any override rows they REPLACE the library
--      list for that item. RLS cascades through program_items, so override
--      access follows the existing program policies (active clients only for
--      coaches, own rows only for clients) -- nothing there is weakened.
--
-- 2. workout_set_logs.swap_reason: why the client swapped. The performed
--    exercise is the existing substituted_exercise_id (planned exercise stays
--    program_item_id, so progress stays linked to the plan). swap_reason is
--    text + CHECK like the rest of the schema, not a new enum.
--
-- No change to existing workout_set_logs policies: client_own / coach_read
-- are row-level, and the stale-edit trigger is column-agnostic.

create table public.exercise_alternatives (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  alternative_exercise_id uuid not null references public.exercises (id) on delete cascade,
  coach_id uuid references public.coaches (id) on delete cascade,
  program_item_id uuid references public.program_items (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint exercise_alternatives_distinct check (exercise_id <> alternative_exercise_id),
  -- platform rows (coach_id null) are library-level only
  constraint exercise_alternatives_platform_library check (coach_id is not null or program_item_id is null)
);

-- One alternative per (exercise, alt) per owner at library level; coalesce so
-- platform rows (coach_id null) are unique too. A plain unique(exercise_id,
-- alternative_exercise_id) would stop two coaches using the same pair.
create unique index exercise_alternatives_library_uniq
  on public.exercise_alternatives (exercise_id, alternative_exercise_id, coalesce(coach_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where program_item_id is null;
create unique index exercise_alternatives_item_uniq
  on public.exercise_alternatives (program_item_id, alternative_exercise_id)
  where program_item_id is not null;

create index exercise_alternatives_exercise_idx on public.exercise_alternatives (exercise_id);
create index exercise_alternatives_item_idx on public.exercise_alternatives (program_item_id)
  where program_item_id is not null;
create index exercise_alternatives_coach_idx on public.exercise_alternatives (coach_id)
  where coach_id is not null;

alter table public.exercise_alternatives enable row level security;

-- Admin manages platform-level (coach_id null, library) rows only, mirroring
-- exercises.admin_*_global. Admins get no access to coach/client rows.
create policy admin_global on public.exercise_alternatives
  for all to authenticated
  using (coach_id is null and program_item_id is null and (select private.is_admin()))
  with check (coach_id is null and program_item_id is null and (select private.is_admin()));

create policy platform_read on public.exercise_alternatives
  for select to authenticated
  using (coach_id is null and program_item_id is null);

-- Coach manages their own rows. Both exercises must be visible to the coach
-- (exercises RLS: global + own), and an override must point at a program item
-- the coach can see/write (program_items RLS) whose exercise is exercise_id.
create policy coach_rw on public.exercise_alternatives
  for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (
    coach_id = (select private.coach_id())
    and exercise_id in (select e.id from public.exercises e)
    and alternative_exercise_id in (select e.id from public.exercises e)
    and (
      program_item_id is null
      or exists (
        select 1 from public.program_items pi
        where pi.id = program_item_id and pi.exercise_id = exercise_alternatives.exercise_id
      )
    )
  );

-- Client reads their coach's list. Override rows are only visible when the
-- client can see the program item (program_items.client_read_own).
create policy client_read on public.exercise_alternatives
  for select to authenticated
  using (
    coach_id = (select private.tenant_id())
    and (
      program_item_id is null
      or program_item_id in (select pi.id from public.program_items pi)
    )
  );

-- Same lapsed-subscription guard as the other coach-owned tables
-- (20261017000002_coach_access_guard.sql).
create policy coach_access_insert on public.exercise_alternatives as restrictive for insert to authenticated
  with check ((select private.coach_id()) is null
              or (select private.coach_has_access((select private.coach_id()))));
create policy coach_access_update on public.exercise_alternatives as restrictive for update to authenticated
  with check ((select private.coach_id()) is null
              or (select private.coach_has_access((select private.coach_id()))));

create trigger stamp_created_by
  before insert or update on public.exercise_alternatives
  for each row execute function private.stamp_created_by_root();

grant select, insert, update, delete on public.exercise_alternatives to authenticated;
grant select, insert, update, delete on public.exercise_alternatives to service_role;

-- Swap reason on the set log (performed exercise = substituted_exercise_id).
alter table public.workout_set_logs
  add column swap_reason text
    constraint workout_set_logs_swap_reason_check
    check (swap_reason in ('equipment_unavailable', 'gym_crowded', 'injury_or_pain', 'other')),
  add constraint workout_set_logs_swap_reason_needs_swap
    check (swap_reason is null or substituted_exercise_id is not null);
