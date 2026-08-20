-- Numbered coaching cues shown on the workout form-check screen — short,
-- ordered technique points (e.g. "shoulders pinned back"), distinct from
-- instructions_ar/instructions_en which are free-flowing paragraph text.
-- Arrays, not a child table: a handful of short strings, owned entirely by
-- the exercise, no independent identity or querying need of their own.
alter table public.exercises
  add column cues_ar text[],
  add column cues_en text[];
