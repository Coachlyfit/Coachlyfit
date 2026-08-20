-- Workout programs. client_id is denormalized down to every child table
-- (not just the parent) so each table's RLS policy is a flat column
-- comparison instead of an EXISTS join up through program_days ->
-- programs — same tradeoff as coach_id, applied one level deeper because
-- these are the tables a client actually reads directly.
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now()
);

create table public.program_days (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  day_index int not null,
  label_ar text,
  label_en text,
  order_index int not null default 0
);

create table public.program_items (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  program_day_id uuid not null references public.program_days (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  sets int not null default 3,
  reps text not null default '8-12',
  rest_seconds int,
  notes_ar text,
  notes_en text,
  order_index int not null default 0
);

-- Diet plans, same shape.
create table public.diet_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now()
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  diet_plan_id uuid not null references public.diet_plans (id) on delete cascade,
  label_ar text,
  label_en text,
  order_index int not null default 0
);

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  meal_id uuid not null references public.meals (id) on delete cascade,
  food_id uuid not null references public.foods (id),
  quantity numeric not null default 1,
  unit text not null default 'serving',
  order_index int not null default 0
);

create index programs_coach_id_idx on public.programs (coach_id);
create index programs_client_id_idx on public.programs (client_id);
create index program_days_coach_id_idx on public.program_days (coach_id);
create index program_days_program_id_idx on public.program_days (program_id);
create index program_items_coach_id_idx on public.program_items (coach_id);
create index program_items_program_day_id_idx on public.program_items (program_day_id);
create index diet_plans_coach_id_idx on public.diet_plans (coach_id);
create index diet_plans_client_id_idx on public.diet_plans (client_id);
create index meals_coach_id_idx on public.meals (coach_id);
create index meals_diet_plan_id_idx on public.meals (diet_plan_id);
create index meal_items_coach_id_idx on public.meal_items (coach_id);
create index meal_items_meal_id_idx on public.meal_items (meal_id);

-- Coach manages everything in their tenant; client reads only their own
-- assigned plans (never another client's, even within the same coach).
do $$
declare
  t text;
begin
  foreach t in array array[
    'programs', 'program_days', 'program_items',
    'diet_plans', 'meals', 'meal_items'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy coach_rw on public.%I for all to authenticated
         using (coach_id = (select private.coach_id()))
         with check (coach_id = (select private.coach_id()))', t
    );
    execute format(
      'create policy client_read_own on public.%I for select to authenticated
         using (client_id = (select private.client_id()))', t
    );
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', t
    );
    execute format(
      'grant select, insert, update, delete on public.%I to service_role', t
    );
  end loop;
end $$;
