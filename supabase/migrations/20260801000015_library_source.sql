-- Library source split: coach-private vs platform-global.
--
-- The `coach_id is null = global` model already existed (see
-- 20260731000006_library.sql); this migration adds the pieces the model was
-- missing: a notification channel, an admin curation path that does NOT
-- require blanket write access to every coach's rows, and the promote
-- function that is the single legitimate cross-coach write.

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
-- Promotion takes an exercise away from its author (coach_id -> null makes
-- their update_own/delete_own policies stop matching), so the author has to
-- be told. Kept deliberately generic — kind + jsonb payload — rather than an
-- exercise_promotions table, since the second producer is inevitable.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Partial index: the bell only ever asks for unread, newest-first.
create index notifications_unread_idx
  on public.notifications (profile_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

create policy read_own on public.notifications
  for select to authenticated
  using (profile_id = (select auth.uid()));

create policy update_own on public.notifications
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- No insert policy for `authenticated` on purpose: the only writer is
-- admin_promote_exercise/_food below, which are security definer and so
-- bypass RLS. Add one when a second, client-side producer appears.
grant select, update on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

-- ---------------------------------------------------------------------------
-- Narrow the admin library policy
-- ---------------------------------------------------------------------------
-- The original admin_write_global was `for all ... using (is_admin())` with
-- no coach_id qualifier, which handed admins UPDATE/DELETE over every
-- coach's PRIVATE rows — wider than the data boundary 20260731000011 draws
-- ("the platform owner sees revenue and churn, never a client's ..."). Split
-- it: admin reads everything (needed to find promotion candidates), but only
-- writes global rows. The one legitimate cross-coach write is promotion,
-- which now goes through a definer function that audits and notifies.
--
-- Also note the (select ...) wrappers, missing from the original: they let
-- Postgres cache the helper as a per-statement InitPlan instead of
-- re-evaluating per row (contract documented in 20260731000004).
drop policy admin_write_global on public.exercises;
drop policy admin_write_global on public.foods;

create policy admin_read_all on public.exercises
  for select to authenticated
  using ((select private.is_admin()));
create policy admin_insert_global on public.exercises
  for insert to authenticated
  with check (coach_id is null and (select private.is_admin()));
create policy admin_update_global on public.exercises
  for update to authenticated
  using (coach_id is null and (select private.is_admin()))
  with check (coach_id is null and (select private.is_admin()));
create policy admin_delete_global on public.exercises
  for delete to authenticated
  using (coach_id is null and (select private.is_admin()));

create policy admin_read_all on public.foods
  for select to authenticated
  using ((select private.is_admin()));
create policy admin_insert_global on public.foods
  for insert to authenticated
  with check (coach_id is null and (select private.is_admin()));
create policy admin_update_global on public.foods
  for update to authenticated
  using (coach_id is null and (select private.is_admin()))
  with check (coach_id is null and (select private.is_admin()));
create policy admin_delete_global on public.foods
  for delete to authenticated
  using (coach_id is null and (select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Promote to global
-- ---------------------------------------------------------------------------
-- Reassign in place (coach_id -> null) rather than copy: the row id is
-- unchanged, so every program_items.exercise_id already pointing at it keeps
-- resolving. A copy would leave the author's plans on a now-duplicate
-- private row.
--
-- The owner is read BEFORE the update: `update ... returning coach_id`
-- returns the NEW row, which is null by construction and would silently skip
-- the notification. `for update` locks the row so a concurrent second
-- promote blocks and then hits the null guard instead of double-notifying.
create function public.admin_promote_exercise(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid;
  v_name_en text;
  v_name_ar text;
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  select e.coach_id, e.name_en, e.name_ar
  into v_coach, v_name_en, v_name_ar
  from public.exercises e
  where e.id = p_id
  for update;

  if not found then
    raise exception 'Exercise not found.' using errcode = '22023';
  end if;
  if v_coach is null then
    raise exception 'Exercise is already global.' using errcode = '22023';
  end if;

  update public.exercises set coach_id = null where id = p_id;

  -- coaches.id = profiles.id (1:1, see 20260731000003_coaches.sql), so the
  -- former coach_id is directly usable as a profile_id.
  insert into public.notifications (profile_id, kind, payload)
  values (
    v_coach,
    'exercise_promoted',
    jsonb_build_object('exercise_id', p_id, 'name_en', v_name_en, 'name_ar', v_name_ar)
  );
end;
$$;

create function public.admin_promote_food(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid;
  v_name_en text;
  v_name_ar text;
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  select f.coach_id, f.name_en, f.name_ar
  into v_coach, v_name_en, v_name_ar
  from public.foods f
  where f.id = p_id
  for update;

  if not found then
    raise exception 'Food not found.' using errcode = '22023';
  end if;
  if v_coach is null then
    raise exception 'Food is already global.' using errcode = '22023';
  end if;

  update public.foods set coach_id = null where id = p_id;

  insert into public.notifications (profile_id, kind, payload)
  values (
    v_coach,
    'food_promoted',
    jsonb_build_object('food_id', p_id, 'name_en', v_name_en, 'name_ar', v_name_ar)
  );
end;
$$;

revoke execute on function public.admin_promote_exercise(uuid) from public;
revoke execute on function public.admin_promote_food(uuid) from public;
grant execute on function public.admin_promote_exercise(uuid) to authenticated;
grant execute on function public.admin_promote_food(uuid) to authenticated;
