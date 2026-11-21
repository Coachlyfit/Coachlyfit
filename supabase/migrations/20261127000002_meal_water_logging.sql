-- ---------------------------------------------------------------------------
-- Meal logging + water intake. Client-authored like nutrition_logs: the
-- client writes their own rows, relationship_id is stamped by trigger, and
-- the coach reads by relationship. Rows only accept today +/- 1 day (the app
-- sends the client's local date, which can differ from UTC's by a day), so
-- an old day can't be rewritten.
-- ---------------------------------------------------------------------------

-- One row per client per meal per day; deleting the row = un-marking the meal.
create table public.meal_completions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  relationship_id uuid references public.coaching_relationships (id) on delete set null,
  meal_id uuid not null references public.meals (id) on delete cascade,
  log_date date not null,
  status text not null check (status in ('eaten', 'skipped')),
  note text check (char_length(note) <= 300),
  logged_at timestamptz not null default now(),
  unique (client_id, meal_id, log_date)
);

create index meal_completions_relationship_id_idx on public.meal_completions (relationship_id);
create index meal_completions_meal_id_idx on public.meal_completions (meal_id);
create index meal_completions_client_date_idx on public.meal_completions (client_id, log_date);

-- One row per tap ("+ a cup"); a day's intake is the sum.
create table public.daily_water_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  relationship_id uuid references public.coaching_relationships (id) on delete set null,
  log_date date not null,
  amount_ml int not null check (amount_ml between 1 and 5000),
  logged_at timestamptz not null default now()
);

create index daily_water_logs_relationship_id_idx on public.daily_water_logs (relationship_id);
create index daily_water_logs_client_date_idx on public.daily_water_logs (client_id, log_date);

alter table public.meal_completions enable row level security;
alter table public.daily_water_logs enable row level security;

-- meal_id must be a meal this client can see (RLS on meals scopes the
-- subquery to their own assigned plan), so a completion can't be filed
-- against someone else's meal.
create policy client_own on public.meal_completions for all to authenticated
  using (client_id = (select private.client_id()))
  with check (
    client_id = (select private.client_id())
    and log_date between current_date - 1 and current_date + 1
    and meal_id in (select id from public.meals)
  );
create policy coach_read on public.meal_completions for select to authenticated
  using (relationship_id in (select private.visible_relationship_ids()));

create policy client_own on public.daily_water_logs for all to authenticated
  using (client_id = (select private.client_id()))
  with check (
    client_id = (select private.client_id())
    and log_date between current_date - 1 and current_date + 1
  );
create policy coach_read on public.daily_water_logs for select to authenticated
  using (relationship_id in (select private.visible_relationship_ids()));

create trigger meal_completions_stamp_relationship
  before insert or update of relationship_id on public.meal_completions
  for each row execute function private.stamp_relationship_id();

create trigger daily_water_logs_stamp_relationship
  before insert or update of relationship_id on public.daily_water_logs
  for each row execute function private.stamp_relationship_id();

grant select, insert, update, delete on public.meal_completions to authenticated;
grant select, insert, update, delete on public.meal_completions to service_role;
grant select, insert, update, delete on public.daily_water_logs to authenticated;
grant select, insert, update, delete on public.daily_water_logs to service_role;

-- Coach-set daily water goal, per plan day (null = app default of 2000 ml).
alter table public.diet_plan_days
  add column water_target_ml int check (water_target_ml > 0);
