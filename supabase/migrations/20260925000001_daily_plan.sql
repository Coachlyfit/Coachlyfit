-- Turns a program day from "a list of exercises" into a complete daily
-- coaching plan: cardio/recovery activities, rehab protocols with
-- week-ranged phases, per-day nutrition (shared or overridden), and a
-- coach note. Everything reuses the existing coach_rw/client_read_own (or
-- coach_read/client_own for client-authored logs) RLS pattern established
-- in 20260731000008_plans.sql and 20260802000001 — coach_id/client_id are
-- denormalized onto every new table for the same flat-column-check reason
-- documented there.

-- ---------------------------------------------------------------------------
-- Day-level additions: a free-text coach note (distinct from an item's
-- notes_ar/en, which are exercise-specific) and a link to this day's
-- nutrition variant. diet_plan_id is nullable and ON DELETE SET NULL — a
-- day with no linked plan just shows no nutrition section, same "absence is
-- the signal, no separate flag" idiom as an empty program_items list
-- already meaning "rest day" (program-cycle.ts).
-- ---------------------------------------------------------------------------
alter table public.program_days
  add column notes_ar text,
  add column notes_en text,
  add column diet_plan_id uuid references public.diet_plans (id) on delete set null;

create index program_days_diet_plan_id_idx on public.program_days (diet_plan_id) where diet_plan_id is not null;

-- ---------------------------------------------------------------------------
-- Cardio and recovery: timed, non-exercise-library activities attached to a
-- day. One table with a `kind` discriminator rather than two near-identical
-- tables — cardio and recovery share every column, only their modality
-- vocabulary and which fields a coach typically fills in differ, and that's
-- a UI-level distinction, not a schema one.
-- ---------------------------------------------------------------------------
create table public.program_activities (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade, -- nullable: template rows, mirrors program_items
  program_day_id uuid not null references public.program_days (id) on delete cascade,
  kind text not null check (kind in ('cardio', 'recovery')),
  modality text not null check (modality in (
    'walking', 'running', 'cycling', 'rowing', 'stairmaster', 'swimming', 'elliptical', 'hiit', 'other',
    'foam_rolling', 'stretching', 'massage', 'sauna', 'cold_plunge', 'breathwork'
  )),
  duration_min int check (duration_min > 0),
  distance_km numeric check (distance_km > 0),
  intensity text check (intensity in ('low', 'moderate', 'high', 'intervals')),
  hr_zone smallint check (hr_zone between 1 and 5),
  kcal_target int check (kcal_target > 0),
  pace text,
  notes_ar text,
  notes_en text,
  log_required boolean not null default true,
  order_index int not null default 0
);

create index program_activities_coach_id_idx on public.program_activities (coach_id);
create index program_activities_program_day_id_idx on public.program_activities (program_day_id);

-- Client-authored: what the client actually did for a given activity on a
-- given calendar date. One row per (activity, date) — a program repeats
-- cyclically (program-cycle.ts), so the same program_activities row is
-- "today's cardio" on more than one real date over the program's life.
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  program_activity_id uuid not null references public.program_activities (id) on delete cascade,
  performed_on date not null default current_date,
  duration_min int check (duration_min > 0),
  distance_km numeric check (distance_km > 0),
  avg_hr smallint check (avg_hr > 0),
  kcal int check (kcal > 0),
  rpe smallint check (rpe between 1 and 10),
  notes text check (char_length(notes) <= 500),
  completed_at timestamptz not null default now(),
  unique (program_activity_id, performed_on)
);

create index activity_logs_coach_id_idx on public.activity_logs (coach_id);
create index activity_logs_client_id_idx on public.activity_logs (client_id, performed_on desc);
create index activity_logs_program_activity_id_idx on public.activity_logs (program_activity_id);

alter table public.program_activities enable row level security;
alter table public.activity_logs enable row level security;

create policy coach_rw on public.program_activities for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));
create policy client_read_own on public.program_activities for select to authenticated
  using (client_id = (select private.client_id()));

-- Same client_own shape as workout_set_logs, including the 7-day edit lock
-- below — a client can fix a mis-logged cardio session shortly after, but
-- not rewrite a week-old entry a coach may have already reviewed.
create policy coach_read on public.activity_logs for select to authenticated
  using (coach_id = (select private.coach_id()));
create policy client_own on public.activity_logs for all to authenticated
  using (client_id = (select private.client_id()))
  with check (client_id = (select private.client_id()));

create trigger activity_logs_reject_stale_edit
  before update or delete on public.activity_logs
  for each row execute function private.reject_stale_client_edit();

grant select, insert, update, delete on public.program_activities to authenticated;
grant select, insert, update, delete on public.activity_logs to authenticated;
grant select, insert, update, delete on public.program_activities to service_role;
grant select, insert, update, delete on public.activity_logs to service_role;

-- ---------------------------------------------------------------------------
-- Rehab: a protocol (the injury/body-area context) owned by a program, made
-- up of phases (week ranges within that program). Rehab EXERCISES stay
-- ordinary program_items (block='rehab', rehab_phase_id set) rather than a
-- parallel item table — that's what reuses the exercise library, per-set
-- prescriptions, session logging, swaps, and pain reporting for free. The
-- protocol/phase tables only hold what's genuinely rehab-specific: injury
-- description, restrictions, and phase timing/criteria.
-- ---------------------------------------------------------------------------
create table public.rehab_protocols (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade, -- nullable: template rows, mirrors programs
  program_id uuid not null references public.programs (id) on delete cascade,
  body_area text not null,
  injury_ar text,
  injury_en text,
  restrictions_ar text,
  restrictions_en text,
  instructions_ar text,
  instructions_en text,
  order_index int not null default 0
);

-- from_week/to_week are 1-based offsets from the program's start_date, in
-- the same week numbering weekIndexForDate (program-cycle.ts) already
-- computes for progression — NOT calendar dates, so a phase survives
-- save-as-template/clone-to-client without re-entry (a template has no
-- meaningful "start date" of its own; an assigned program's clone always
-- starts today, per cloneToClient). The builder/client UI compute display
-- dates from programs.start_date + (week - 1) * 7 days.
create table public.rehab_phases (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  protocol_id uuid not null references public.rehab_protocols (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  from_week int not null check (from_week between 1 and 12),
  to_week int not null check (to_week between 1 and 12),
  goals_ar text,
  goals_en text,
  progression_criteria_ar text,
  progression_criteria_en text,
  order_index int not null default 0,
  constraint rehab_phases_week_range check (from_week <= to_week)
);

create index rehab_protocols_coach_id_idx on public.rehab_protocols (coach_id);
create index rehab_protocols_program_id_idx on public.rehab_protocols (program_id);
create index rehab_phases_coach_id_idx on public.rehab_phases (coach_id);
create index rehab_phases_protocol_id_idx on public.rehab_phases (protocol_id);

alter table public.rehab_protocols enable row level security;
alter table public.rehab_phases enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['rehab_protocols', 'rehab_phases']
  loop
    execute format(
      'create policy coach_rw on public.%I for all to authenticated
         using (coach_id = (select private.coach_id()))
         with check (coach_id = (select private.coach_id()))', t
    );
    execute format(
      'create policy client_read_own on public.%I for select to authenticated
         using (client_id = (select private.client_id()))', t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- program_items joins the rehab model: 'mobility' and 'rehab' extend the
-- existing block vocabulary (warmup/main/cooldown,
-- 20260904000001_program_item_block_and_private_note.sql) rather than a
-- parallel column, since block already IS "which section of the day this
-- item belongs to". rehab_phase_id is only meaningful when block='rehab';
-- left null it just means "not phase-scoped rehab work" (e.g. block =
-- 'mobility', which isn't tied to a rehab protocol at all).
alter table public.program_items drop constraint program_items_block_check;
alter table public.program_items
  add constraint program_items_block_check check (block in ('warmup', 'main', 'cooldown', 'mobility', 'rehab'));
alter table public.program_items
  add column rehab_phase_id uuid references public.rehab_phases (id) on delete set null;
create index program_items_rehab_phase_id_idx on public.program_items (rehab_phase_id) where rehab_phase_id is not null;

-- ---------------------------------------------------------------------------
-- Duration-based sets: a rehab hold or a stretch is prescribed/logged in
-- seconds, not reps. reps becomes nullable and duration_seconds is added
-- alongside it, with a check that at least one is set — existing rows all
-- have reps, so they're unaffected; a new duration set just leaves reps
-- null instead. workout_set_logs gets the matching column so actual hold
-- time can be logged the same way actual reps are.
-- ---------------------------------------------------------------------------
alter table public.program_item_sets
  alter column reps drop not null,
  alter column reps drop default,
  add column duration_seconds int check (duration_seconds > 0),
  add constraint program_item_sets_reps_or_duration check (reps is not null or duration_seconds is not null);

alter table public.workout_set_logs
  add column duration_seconds int check (duration_seconds > 0);

-- ---------------------------------------------------------------------------
-- Per-day nutrition: a diet_plans row becomes either standalone (program_id
-- null, today's behavior — the /diets feature) or a program-owned "variant"
-- (program_id set) such as "Training day" / "Rest day". A variant is
-- reusable across N days via program_days.diet_plan_id: several days
-- pointing at the same diet_plans row is a shared plan (Approach A), each
-- day pointing at its own row is fully per-day (Approach B). "Customize
-- this day" in the UI just clones the variant and repoints that one day —
-- no schema difference between "shared" and "overridden", only how many
-- program_days rows happen to point at a given plan.
--
-- target_* are optional macro targets a coach can set on a variant even
-- before adding any meals — the diet builder today only ever shows computed
-- totals from meal_items; these are compared against that total, not
-- derived from it. meals.time_of_day is meal-timing (e.g. "12:30"), never
-- required.
-- ---------------------------------------------------------------------------
alter table public.diet_plans
  add column program_id uuid references public.programs (id) on delete cascade,
  add column target_kcal int check (target_kcal > 0),
  add column target_protein_g numeric check (target_protein_g >= 0),
  add column target_carb_g numeric check (target_carb_g >= 0),
  add column target_fat_g numeric check (target_fat_g >= 0),
  add column notes_ar text,
  add column notes_en text;

create index diet_plans_program_id_idx on public.diet_plans (program_id) where program_id is not null;

alter table public.meals
  add column time_of_day time;
