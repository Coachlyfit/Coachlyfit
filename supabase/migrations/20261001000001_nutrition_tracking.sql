-- ---------------------------------------------------------------------------
-- Nutrition tracking: body data for target suggestions, daily intake logs
-- (with off-plan reports), and per-client logging reminders.
-- ---------------------------------------------------------------------------

-- Inputs for the macro suggestion (weight itself comes from checkins).
-- Keyed by client, not coach: it describes the person, so it survives a
-- coach switch, and both the client and their active coach may edit it.
create table public.client_body_profiles (
  client_id uuid primary key references public.clients (id) on delete cascade,
  height_cm numeric check (height_cm between 100 and 250),
  birth_date date,
  sex text check (sex in ('male', 'female')),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal text check (goal in ('cut', 'maintain', 'bulk')),
  created_at timestamptz not null default now()
);

alter table public.client_body_profiles enable row level security;

create policy client_own on public.client_body_profiles for all to authenticated
  using (client_id = (select private.client_id()))
  with check (client_id = (select private.client_id()));
create policy coach_rw on public.client_body_profiles for all to authenticated
  using (client_id in (select private.active_client_ids()))
  with check (client_id in (select private.active_client_ids()));

grant select, insert, update, delete on public.client_body_profiles to authenticated;
grant select, insert, update, delete on public.client_body_profiles to service_role;

-- Whether a plan's targets were typed by hand, taken from the suggestion
-- as-is, or taken from the suggestion and then edited -- plus what the
-- suggestion was, so "edited" can be shown against the original numbers.
alter table public.diet_plans
  add column targets_source text check (targets_source in ('manual', 'suggested', 'suggested_edited')),
  add column targets_suggestion jsonb;

-- ---------------------------------------------------------------------------
-- One row per client per day. A day counts as logged when it has kcal or an
-- off-plan report; same client-authored shape as checkins (relationship
-- stamping, coach reads by relationship, 7-day edit lock on created_at).
create table public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  relationship_id uuid references public.coaching_relationships (id) on delete set null,
  log_date date not null,
  kcal int check (kcal > 0 and kcal <= 20000),
  protein_g numeric check (protein_g >= 0 and protein_g <= 2000),
  carb_g numeric check (carb_g >= 0 and carb_g <= 2000),
  fat_g numeric check (fat_g >= 0 and fat_g <= 2000),
  off_plan boolean not null default false,
  off_plan_meal text check (char_length(off_plan_meal) <= 100),
  off_plan_note text check (char_length(off_plan_note) <= 500),
  off_plan_kcal int check (off_plan_kcal > 0 and off_plan_kcal <= 20000),
  off_plan_photo_path text,
  created_at timestamptz not null default now(),
  unique (client_id, log_date),
  check (kcal is not null or off_plan)
);

create index nutrition_logs_coach_id_idx on public.nutrition_logs (coach_id);
create index nutrition_logs_relationship_id_idx on public.nutrition_logs (relationship_id);

alter table public.nutrition_logs enable row level security;

create policy client_own on public.nutrition_logs for all to authenticated
  using (client_id = (select private.client_id()))
  with check (client_id = (select private.client_id()));
create policy coach_read on public.nutrition_logs for select to authenticated
  using (relationship_id in (select private.visible_relationship_ids()));

create trigger nutrition_logs_stamp_relationship
  before insert or update of relationship_id on public.nutrition_logs
  for each row execute function private.stamp_relationship_id();

create trigger nutrition_logs_reject_stale_edit
  before update or delete on public.nutrition_logs
  for each row execute function private.reject_stale_checkin_edit();

grant select, insert, update, delete on public.nutrition_logs to authenticated;
grant select, insert, update, delete on public.nutrition_logs to service_role;

-- Tell the coach the relationship was logged under (the active one, via
-- the stamp trigger) when a day is reported off-plan -- on insert, or when
-- an already-logged day is flipped to off-plan.
create function private.notify_on_off_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid;
  v_client_name text;
begin
  if not new.off_plan or (tg_op = 'UPDATE' and old.off_plan) then
    return new;
  end if;

  select coach_id into v_coach_id
  from public.coaching_relationships where id = new.relationship_id;
  if v_coach_id is null then
    return new;
  end if;

  select display_name into v_client_name
  from public.clients where id = new.client_id;

  insert into public.notifications (profile_id, kind, payload)
  values (
    v_coach_id,
    'off_plan_reported',
    jsonb_build_object(
      'client_id', new.client_id,
      'client_name', v_client_name,
      'log_date', new.log_date
    )
  );

  return new;
end;
$$;

create trigger nutrition_logs_notify_off_plan
  after insert or update of off_plan on public.nutrition_logs
  for each row execute function private.notify_on_off_plan();

-- ---------------------------------------------------------------------------
-- Daily "log your intake" reminder. Only the client reads/writes it; the
-- cron (service_role) reads it and stamps last_reminded_on so a client gets
-- at most one reminder per local day. timezone is IANA, from the browser.
create table public.nutrition_reminder_settings (
  client_id uuid primary key references public.clients (id) on delete cascade,
  enabled boolean not null default true,
  remind_at time not null default '20:00',
  timezone text not null,
  last_reminded_on date,
  created_at timestamptz not null default now()
);

create index nutrition_reminder_settings_enabled_idx
  on public.nutrition_reminder_settings (client_id) where enabled;

alter table public.nutrition_reminder_settings enable row level security;

create policy client_own on public.nutrition_reminder_settings for all to authenticated
  using (client_id = (select private.client_id()))
  with check (client_id = (select private.client_id()));

grant select, insert, update, delete on public.nutrition_reminder_settings to authenticated;
grant select, insert, update, delete on public.nutrition_reminder_settings to service_role;

-- ---------------------------------------------------------------------------
-- A daily reminder is push-only: queuing an email for it every day would be
-- spam. Otherwise unchanged from 20260911000001.
create or replace function private.queue_notification_deliveries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wants_email boolean;
  v_has_push boolean;
begin
  select email_notifications into v_wants_email
  from public.profiles
  where id = new.profile_id;

  if coalesce(v_wants_email, true) and new.kind <> 'nutrition_log_reminder' then
    insert into public.notification_deliveries (notification_id, channel)
    values (new.id, 'email');
  end if;

  select exists(select 1 from public.push_subscriptions where profile_id = new.profile_id) into v_has_push;
  if v_has_push then
    insert into public.notification_deliveries (notification_id, channel)
    values (new.id, 'push');
  end if;

  return new;
end;
$$;
