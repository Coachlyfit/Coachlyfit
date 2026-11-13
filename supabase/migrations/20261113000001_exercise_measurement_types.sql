-- Exercise measurement types. Until now an exercise had no notion of *how it
-- is measured*: duration mode was inferred from the program block, cardio
-- lived in a parallel table, and nothing could carry distance/calories/etc.
--
-- 1. exercises.measurement_type decides which inputs the builder, the client
--    runner and the progress views show for that exercise. Text + CHECK (same
--    convention as group_kind / progression_rule / modality), not an enum.
-- 2. program_item_sets (prescribed) and workout_set_logs (actual) gain the
--    same new columns so a target and what was done always have one shape:
--    distance_m, calories, and `extra` jsonb for the long tail (rounds, work/
--    rest seconds, level, incline, speed, laps, steps, side, set_type).
--    workout_set_logs also gets rir.
-- 3. A set may now be prescribed/logged by reps, duration, distance or
--    calories, alone or combined: the old "reps or duration" check widens to
--    "at least one measure".
--
-- Schema only. Backfilling measurement_type on existing exercises and the
-- new curated library entries are in 20261113000002.
--
-- No RLS change: every new column sits on a table whose policies are flat
-- coach_id / client_id comparisons (coach_rw / client_read_own on
-- program_item_sets, coach_read / client_own on workout_set_logs), and the
-- exercises read_own_and_global / write policies are row-level, not
-- column-level. The 7-day client edit lock trigger on workout_set_logs
-- already covers the new columns.

alter table public.exercises
  add column measurement_type text not null default 'weight_reps'
    check (measurement_type in (
      'weight_reps', 'bodyweight_reps', 'assisted_bw', 'duration', 'distance',
      'distance_duration', 'calories', 'weight_duration', 'weight_distance',
      'reps_duration', 'intervals', 'cardio_machine', 'steps_laps'
    ));

alter table public.program_item_sets
  add column distance_m numeric check (distance_m > 0),
  add column calories int check (calories > 0),
  add column extra jsonb check (extra is null or jsonb_typeof(extra) = 'object');

alter table public.program_item_sets
  drop constraint program_item_sets_reps_or_duration,
  add constraint program_item_sets_has_measure
    check (reps is not null or duration_seconds is not null or distance_m is not null or calories is not null or extra is not null);

alter table public.workout_set_logs
  add column distance_m numeric check (distance_m > 0),
  add column calories int check (calories > 0),
  add column rir smallint check (rir between 0 and 10),
  add column extra jsonb check (extra is null or jsonb_typeof(extra) = 'object');

-- ---------------------------------------------------------------------------
-- exercises_visible carries an explicit column list (see
-- 20260831000001_exercise_content.sql), so a new column on exercises is
-- invisible to the library UI until the view is rebuilt.
--
-- Dropped and recreated rather than `create or replace`d: the hosted
-- database's view has cues_ar/cues_en at ordinals 11-12 (it was built
-- incrementally), while a from-scratch replay has source_exercise_id there,
-- so no single create-or-replace column order is valid on both (42P16).
-- Nothing depends on the view (checked: no dependent views; the facets
-- function is plain SQL and resolved at call time), so a drop is safe. It is
-- security invoker, so the base table's RLS still decides what a caller sees.
-- ---------------------------------------------------------------------------
drop view public.exercises_visible;

create view public.exercises_visible
with (security_invoker = true) as
select
  e.id,
  e.coach_id,
  e.name_ar,
  e.name_en,
  e.muscle_group,
  e.equipment,
  e.instructions_ar,
  e.instructions_en,
  e.video_url,
  e.created_at,
  e.source_exercise_id,
  e.image_url,
  e.coach_notes_ar,
  e.coach_notes_en,
  e.cues_ar,
  e.cues_en,
  s.name_ar as source_name_ar,
  s.name_en as source_name_en,
  (
    select c.id
    from public.exercises c
    where c.source_exercise_id = e.id and c.coach_id = (select private.tenant_id())
    limit 1
  ) as my_clone_id,
  e.steps_ar,
  e.steps_en,
  e.mistakes_ar,
  e.mistakes_en,
  e.safety_ar,
  e.safety_en,
  e.tempo,
  e.primary_muscles,
  e.secondary_muscles,
  e.difficulty,
  e.thumbnail_url,
  e.video_url_alt,
  e.archived_at,
  e.measurement_type
from public.exercises e
left join public.exercises s on s.id = e.source_exercise_id;

-- Same grants 20260805000001_library_clone.sql gave the original view.
grant select on public.exercises_visible to authenticated;
grant select on public.exercises_visible to service_role;

-- ---------------------------------------------------------------------------
-- exercise_bests: add the non-weight bests the progress views need. The
-- return type changes, so the function is dropped and recreated. Still
-- security invoker: the caller's RLS on workout_set_logs decides which rows
-- count. Heaviest-weight ordering is unchanged and already correct for
-- assisted sets (stored negative: -5 beats -20).
-- ---------------------------------------------------------------------------
drop function public.exercise_bests(uuid, timestamptz, timestamptz);

create function public.exercise_bests(p_client_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (
  exercise_id uuid,
  best_weight numeric,
  best_reps int,
  best_at timestamptz,
  set_count bigint,
  last_at timestamptz,
  max_reps int,
  best_duration int,
  best_distance numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select l.exercise_id, l.weight, l.reps, l.duration_seconds, l.distance_m, l.completed_at
    from public.workout_set_logs l
    where l.client_id = p_client_id
      and l.exercise_id is not null
      and (p_from is null or l.completed_at >= p_from)
      and (p_to is null or l.completed_at < p_to)
  ),
  best as (
    select distinct on (s.exercise_id) s.exercise_id, s.weight, s.reps, s.completed_at
    from s
    order by s.exercise_id, s.weight desc nulls last, s.reps desc nulls last
  ),
  agg as (
    select
      s.exercise_id,
      count(*) as set_count,
      max(s.completed_at) as last_at,
      max(s.reps) as max_reps,
      max(s.duration_seconds) as best_duration,
      max(s.distance_m) as best_distance
    from s
    group by s.exercise_id
  )
  select b.exercise_id, b.weight, b.reps, b.completed_at, a.set_count, a.last_at,
         a.max_reps, a.best_duration, a.best_distance
  from best b
  join agg a on a.exercise_id = b.exercise_id
$$;

revoke execute on function public.exercise_bests(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.exercise_bests(uuid, timestamptz, timestamptz) to authenticated;
