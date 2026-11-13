-- P0 of the training-plan-type audit: let a program say what kind of plan it
-- is, let a group of items be a timed format (AMRAP / EMOM / For Time /
-- Tabata / giant set), and give a session somewhere to keep per-block scores.
-- Columns on existing tables only, so the existing RLS policies already cover
-- them (coach_rw / client_read_own on programs + program_items, client_own on
-- workout_sessions).

-- 1. Plan metadata -----------------------------------------------------------
-- All nullable: programs that predate this have no type, and "no type" is a
-- valid state (the list just doesn't badge them).
alter table public.programs
  add column plan_type text
    check (plan_type in (
      'strength', 'hypertrophy', 'crossfit', 'hyrox', 'combat', 'calisthenics', 'hybrid',
      'endurance', 'hiit', 'mobility', 'general', 'sport', 'weightlifting', 'home'
    )),
  add column goal text
    check (goal in ('strength', 'muscle', 'fat_loss', 'endurance', 'performance', 'mobility', 'general')),
  add column level text
    check (level in ('beginner', 'intermediate', 'advanced')),
  add column equipment text[] not null default '{}',
  add column description_ar text check (char_length(description_ar) <= 500),
  add column description_en text check (char_length(description_en) <= 500);

create index programs_plan_type_idx on public.programs (plan_type) where plan_type is not null;

-- 2. Blocks + group formats --------------------------------------------------
alter table public.program_items drop constraint program_items_block_check;
alter table public.program_items
  add constraint program_items_block_check
  check (block in ('warmup', 'main', 'accessory', 'finisher', 'cooldown', 'mobility', 'rehab'));

alter table public.program_items drop constraint program_items_group_kind_check;
alter table public.program_items
  add constraint program_items_group_kind_check
  check (group_kind in ('superset', 'circuit', 'giant_set', 'amrap', 'emom', 'for_time', 'tabata'));

-- Format parameters of a timed group: { time_cap_s, rounds, interval_s,
-- work_s, rest_s }. Stored identically on EVERY member of the group (not just
-- a head item) so a reorder / ungroup / clone can never orphan it; the
-- service writes all members together and readers use any one. Shape is
-- validated by groupConfigSchema in the app; the DB only guards the type.
alter table public.program_items
  add column group_config jsonb
    check (group_config is null or jsonb_typeof(group_config) = 'object');

-- 3. Per-block results on a session -------------------------------------------
-- Keyed by group_key: { "<group_key>": { kind, rounds, extra_reps, time_s,
-- rx, time_cap_hit, splits_s[] } }. One jsonb on the session rather than a
-- table: a block result is read and written whole, never queried across
-- sessions in SQL (progress derives from it in app code).
alter table public.workout_sessions
  add column block_results jsonb not null default '{}'::jsonb
    check (jsonb_typeof(block_results) = 'object');
