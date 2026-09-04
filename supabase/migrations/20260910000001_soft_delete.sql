-- Soft delete for coach-owned roots (programs, exercises, diet_plans).
-- "Delete" from the UI now sets archived_at instead of removing the row,
-- so a coach can undo an accidental delete; a cron hard-deletes rows
-- archived over 30 days ago. Child rows (program_days, meals, etc.) are
-- untouched -- an archived parent just stops appearing in list queries,
-- its tree still resolves fine for the restore/hard-delete path.
alter table public.programs add column archived_at timestamptz;
alter table public.exercises add column archived_at timestamptz;
alter table public.diet_plans add column archived_at timestamptz;

create index programs_archived_at_idx on public.programs (archived_at) where archived_at is not null;
create index exercises_archived_at_idx on public.exercises (archived_at) where archived_at is not null;
create index diet_plans_archived_at_idx on public.diet_plans (archived_at) where archived_at is not null;

-- exercises_visible must carry archived_at too, or the library UI can't
-- filter it out (see 20260831000001_exercise_content.sql's comment on why
-- new columns are appended last, not interleaved).
create or replace view public.exercises_visible
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
  e.cues_ar,
  e.cues_en,
  e.source_exercise_id,
  e.image_url,
  e.coach_notes_ar,
  e.coach_notes_en,
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
  e.archived_at
from public.exercises e
left join public.exercises s on s.id = e.source_exercise_id;
