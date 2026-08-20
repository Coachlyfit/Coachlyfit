-- 20260805000001_library_clone.sql's own comment: "a migration that adds a
-- column to exercises/foods must `create or replace view` here too, or the
-- new column will be invisible to the library reads" — `e.*` is expanded at
-- view-creation time, not re-evaluated when the base table gains columns.
-- 20260807000001_exercise_cues.sql added cues_ar/cues_en without this step.
create or replace view public.exercises_visible with (security_invoker = true) as
select
  e.*,
  s.name_ar as source_name_ar,
  s.name_en as source_name_en,
  (
    select c.id
    from public.exercises c
    where c.source_exercise_id = e.id
      and c.coach_id = (select private.tenant_id())
    limit 1
  ) as my_clone_id
from public.exercises e
left join public.exercises s on s.id = e.source_exercise_id;
