-- Richer exercise content — numbered execution steps, common mistakes,
-- a safety note, tempo, primary/secondary muscles, difficulty, and an
-- alternate-angle video. All additive and nullable: existing rows show
-- nothing extra until a coach fills them in. Arrays for steps/mistakes,
-- same convention as the existing cues_ar/cues_en (a handful of short
-- strings with no independent identity, not a child table).
alter table public.exercises
  add column steps_ar text[],
  add column steps_en text[],
  add column mistakes_ar text[],
  add column mistakes_en text[],
  add column safety_ar text,
  add column safety_en text,
  add column tempo text,
  add column primary_muscles text[],
  add column secondary_muscles text[],
  add column difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  add column thumbnail_url text,
  add column video_url_alt text;

-- exercises_visible carries an explicit column list (not select *), so the
-- new columns need adding here too or the library UI can never read them
-- back. create or replace preserves the view's grants/policies since the
-- output column set only grows (existing columns keep their name, type,
-- and position) -- Postgres only forbids that when a column is dropped,
-- renamed, or retyped.
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
  -- New columns MUST be appended after every pre-existing one, in this
  -- exact order -- Postgres only allows CREATE OR REPLACE VIEW to add
  -- trailing columns, never reorder or insert among existing ones
  -- (42P16), so this list can never be alphabetized or grouped with its
  -- related e.* columns above without a future migration hitting the same
  -- error.
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
  e.video_url_alt
from public.exercises e
left join public.exercises s on s.id = e.source_exercise_id;
