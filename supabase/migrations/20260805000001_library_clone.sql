-- Clone & Customize: a coach copies a global exercise/food into their own
-- library and edits it freely, without touching the original.
--
-- No new ownership model. `coach_id is null = global` already answers "who
-- owns this" (20260731000006_library.sql), and "all / global / mine" already
-- reads off it. What was missing is provenance — which global a coach's row
-- was copied from — plus the handful of columns a coach actually wants to
-- customize.
--
-- Deliberately a COPY, not an inheriting view: the whole point is that a
-- later admin edit to the global must never overwrite the coach's own
-- instructions or video. See the `on delete set null` note below for the
-- other half of that independence.

-- ---------------------------------------------------------------------------
-- Provenance + coach-editable columns
-- ---------------------------------------------------------------------------
-- `on delete set null` rather than cascade: deleting a global entry must not
-- take every coach's customized copy with it. The clone survives as a plain
-- private row that has simply lost its "Based on" attribution.
--
-- No created_by/updated_by/updated_at. coach_id already answers "who owns
-- this" and source_*_id answers "cloned from what"; this schema has no
-- updated_at column and no moddatetime trigger anywhere, and adding the
-- first one here would serve no current consumer.
--
-- exercises.instructions_ar/_en are NOT re-added — they have existed since
-- 20260731000006 and are populated by scripts/seed-exercises-opengym.mts;
-- this feature is what finally surfaces them in a form.
alter table public.exercises
  add column source_exercise_id uuid references public.exercises (id) on delete set null,
  add column image_url text,
  add column coach_notes_ar text,
  add column coach_notes_en text;

-- foods had no free-text column at all, so the coach-specific description /
-- serving guidance needs somewhere to live.
alter table public.foods
  add column source_food_id uuid references public.foods (id) on delete set null,
  add column notes_ar text,
  add column notes_en text;

-- One clone per coach per source. Partial so the 1,324 seeded globals (and
-- every pre-existing coach row) stay outside the index entirely.
--
-- Column order (coach_id, source_*_id) also serves the my_clone_id lookup in
-- the views below, which has equality on both — so no second index.
--
-- A promoted clone (admin_promote_exercise sets coach_id -> null, keeping
-- source_exercise_id) lands with a null coach_id; Postgres treats NULLs as
-- distinct in a unique index, so several promoted rows sharing one source
-- are still allowed.
create unique index exercises_coach_source_uniq
  on public.exercises (coach_id, source_exercise_id)
  where source_exercise_id is not null;
create unique index foods_coach_source_uniq
  on public.foods (coach_id, source_food_id)
  where source_food_id is not null;

-- ---------------------------------------------------------------------------
-- Read views
-- ---------------------------------------------------------------------------
-- Two things the base table can't express to PostgREST:
--
--   my_clone_id     — have I already customized this global? Drives both the
--                     "Clone & Customize" vs "Edit my version" button and the
--                     de-duplication of the "All" tab: once a coach has their
--                     own version, showing the global next to it is two rows
--                     with the same name and no way to tell them apart.
--                     `source = "all"` filters on `my_clone_id is null`;
--                     `source = "global"` does not, so the Global tab still
--                     lists every global.
--   source_name_*   — the "Based on: <name>" line, which has to keep showing
--                     the ORIGINAL name after the coach renames their copy.
--
-- security_invoker so the caller's RLS applies to both the outer scan and the
-- self-join: a source row the caller can't read yields null names rather than
-- leaking another tenant's data. No new policy is needed for the same reason.
--
-- tenant_id(), not coach_id(): a client viewing their coach's library should
-- see the same de-duplicated set the coach does. It returns null for an admin,
-- so my_clone_id is always null there and admin_read_all still sees every row
-- — which is what the admin library page wants.
--
-- MAINTENANCE: `select e.*` is expanded and frozen at creation time. A future
-- migration that adds a column to exercises/foods must `create or replace
-- view` here too, or the new column will be invisible to the library reads.
create view public.exercises_visible with (security_invoker = true) as
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

create view public.foods_visible with (security_invoker = true) as
select
  f.*,
  s.name_ar as source_name_ar,
  s.name_en as source_name_en,
  (
    select c.id
    from public.foods c
    where c.source_food_id = f.id
      and c.coach_id = (select private.tenant_id())
    limit 1
  ) as my_clone_id
from public.foods f
left join public.foods s on s.id = f.source_food_id;

-- Read-only by design: every write still goes to the base table, where the
-- existing write_own / update_own / delete_own policies apply unchanged.
grant select on public.exercises_visible to authenticated;
grant select on public.foods_visible to authenticated;
grant select on public.exercises_visible to service_role;
grant select on public.foods_visible to service_role;
