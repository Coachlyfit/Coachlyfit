-- 20260805000001_library_clone.sql's own comment: "a migration that adds a
-- column to exercises/foods must `create or replace view` here too, or the
-- new column will be invisible to the library reads" — `e.*` is expanded at
-- view-creation time, not re-evaluated when the base table gains columns.
-- 20260807000001_exercise_cues.sql added cues_ar/cues_en without this step.
--
-- Switched from `select e.*` to an explicit column list here (matching the
-- pattern every later view-touching migration already uses, see
-- 20260831000001_exercise_content.sql's comment on 42P16) instead of
-- `create or replace view ... e.*, ...`: with e.*, the two new trailing
-- columns land BETWEEN e.*'s old last column and source_name_ar/my_clone_id
-- below, which Postgres's CREATE OR REPLACE VIEW rejects (42P16 — it only
-- allows appending at the very end, never inserting mid-list). This was
-- never caught before because nothing had replayed every migration from a
-- fresh database until CI's from-scratch `supabase start` did.
-- Column order here must match the PRIOR view's ordinal positions exactly
-- through the columns it already had: 20260805000001_library_clone.sql's
-- `create view` used `e.*`, frozen at creation time to the base table's
-- then-order (…, created_at, source_exercise_id, image_url, coach_notes_ar,
-- coach_notes_en), so cues_ar/cues_en — added to the table AFTER those —
-- must be appended after coach_notes_en here too, not after created_at,
-- or CREATE OR REPLACE VIEW rejects the rename at that ordinal (42P16).
-- Every later create-or-replace of this view (20260831000001_exercise_content.sql,
-- 20260910000001_soft_delete.sql) must in turn match this column order
-- exactly through this point — CREATE OR REPLACE VIEW checks the name at
-- each ordinal position, not which base-table column feeds it.
create or replace view public.exercises_visible with (security_invoker = true) as
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
    where c.source_exercise_id = e.id
      and c.coach_id = (select private.tenant_id())
    limit 1
  ) as my_clone_id
from public.exercises e
left join public.exercises s on s.id = e.source_exercise_id;
