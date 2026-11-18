-- Diet plan day-types: one plan holds several days (Training / Rest / custom),
-- each with its own targets, notes and meals, optionally mapped to weekdays.
--
-- Backward compatible: every existing plan gets one default day ("Every day")
-- carrying the plan's current targets, and its meals are pointed at it.
-- diet_plans.target_* stay as the overall / fallback values.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table public.diet_plan_days (
  id uuid primary key default gen_random_uuid(),
  diet_plan_id uuid not null references public.diet_plans (id) on delete cascade,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  -- Nullable like meals.client_id: a template's days have no client.
  client_id uuid references public.clients (id) on delete cascade,
  name_ar text not null check (char_length(name_ar) between 1 and 60),
  name_en text not null check (char_length(name_en) between 1 and 60),
  kind text not null default 'custom' check (kind in ('training', 'rest', 'custom')),
  order_index int not null default 0,
  target_kcal int check (target_kcal > 0),
  target_protein_g numeric check (target_protein_g >= 0),
  target_carb_g numeric check (target_carb_g >= 0),
  target_fat_g numeric check (target_fat_g >= 0),
  notes_ar text,
  notes_en text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Target of the composite FKs below: a meal / schedule row can only point
  -- at a day of its own plan.
  unique (id, diet_plan_id)
);

-- Weekday -> day. Unmapped weekdays fall back in app code (first training
-- day, else first day). coach_id / client_id are denormalized, like meals, so
-- the RLS policies can mirror the meals ones.
create table public.diet_plan_schedule (
  diet_plan_id uuid not null references public.diet_plans (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  diet_plan_day_id uuid not null,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (diet_plan_id, weekday),
  foreign key (diet_plan_day_id, diet_plan_id)
    references public.diet_plan_days (id, diet_plan_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- 2. Backfill: one default day per existing plan, meals pointed at it
-- ---------------------------------------------------------------------------

alter table public.meals add column diet_plan_day_id uuid;

insert into public.diet_plan_days (
  diet_plan_id, coach_id, client_id, name_ar, name_en, kind, order_index,
  target_kcal, target_protein_g, target_carb_g, target_fat_g, created_by
)
select
  p.id, p.coach_id, p.client_id, 'كل الأيام', 'Every day', 'custom', 0,
  p.target_kcal, p.target_protein_g, p.target_carb_g, p.target_fat_g, p.created_by
from public.diet_plans p;

update public.meals m
   set diet_plan_day_id = d.id
  from public.diet_plan_days d
 where d.diet_plan_id = m.diet_plan_id;

alter table public.meals alter column diet_plan_day_id set not null;

alter table public.meals
  add constraint meals_diet_plan_day_fk
  foreign key (diet_plan_day_id, diet_plan_id)
  references public.diet_plan_days (id, diet_plan_id) on delete cascade;

-- Which day a logged intake was measured against. SET NULL: deleting a day
-- must not delete the client's history.
alter table public.nutrition_logs
  add column diet_plan_day_id uuid references public.diet_plan_days (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. Indexes (every FK)
-- ---------------------------------------------------------------------------

create index diet_plan_days_diet_plan_id_idx on public.diet_plan_days (diet_plan_id);
create index diet_plan_days_coach_id_idx on public.diet_plan_days (coach_id);
create index diet_plan_days_client_id_idx on public.diet_plan_days (client_id);
create index diet_plan_days_created_by_idx on public.diet_plan_days (created_by);
create index diet_plan_schedule_day_idx on public.diet_plan_schedule (diet_plan_day_id, diet_plan_id);
create index diet_plan_schedule_coach_id_idx on public.diet_plan_schedule (coach_id);
create index diet_plan_schedule_client_id_idx on public.diet_plan_schedule (client_id);
create index meals_diet_plan_day_idx on public.meals (diet_plan_day_id, diet_plan_id);
create index nutrition_logs_diet_plan_day_id_idx on public.nutrition_logs (diet_plan_day_id);

-- ---------------------------------------------------------------------------
-- 4. created_by stamping (same shape as stamp_created_by_meals)
-- ---------------------------------------------------------------------------

create or replace function private.stamp_created_by_diet_plan_days()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.created_by := old.created_by; return new; end if;
  select created_by into new.created_by from public.diet_plans where id = new.diet_plan_id;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create trigger stamp_created_by
  before insert or update on public.diet_plan_days
  for each row execute function private.stamp_created_by_diet_plan_days();

-- ---------------------------------------------------------------------------
-- 5. RLS: mirrors meals exactly
--    client_read_own (20260731000008), coach_rw (20261112000004),
--    coach_read_own (20261120000001), restrictive coach_access_* (20261017000002)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['diet_plan_days', 'diet_plan_schedule']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy client_read_own on public.%I for select to authenticated
         using (client_id = (select private.client_id()))', t
    );

    execute format($p$
      create policy coach_rw on public.%I
        for all to authenticated
        using (
          coach_id = (select private.coach_id())
          and (
            (client_id is null and (
              (select private.is_team_owner())
              or exists (
                select 1 from public.diet_plans p
                where p.id = %I.diet_plan_id and p.created_by = (select auth.uid())
              )
            ))
            or (client_id is not null and client_id in (select private.active_client_ids()))
          )
        )
        with check (
          coach_id = (select private.coach_id())
          and (
            (client_id is null and (
              (select private.is_team_owner())
              or exists (
                select 1 from public.diet_plans p
                where p.id = %I.diet_plan_id and p.created_by = (select auth.uid())
              )
            ))
            or (client_id is not null and client_id in (select private.active_client_ids()))
          )
        )
    $p$, t, t, t);

    execute format($p$
      create policy coach_read_own on public.%I
        for select to authenticated
        using (
          coach_id = (select private.coach_id())
          and (client_id is null or client_id not in (select private.deleted_client_ids()))
          and (
            client_id is null
            or (select private.is_team_owner())
            or client_id in (select private.accessible_client_ids())
          )
        )
    $p$, t);

    execute format(
      'create policy coach_access_insert on public.%I as restrictive for insert to authenticated
         with check ((select private.coach_id()) is null
                     or (select private.coach_has_access((select private.coach_id()))))', t
    );
    execute format(
      'create policy coach_access_update on public.%I as restrictive for update to authenticated
         with check ((select private.coach_id()) is null
                     or (select private.coach_has_access((select private.coach_id()))))', t
    );

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
