-- Client-side workout execution logging, coach<->client messaging, and one
-- additive check-in field. Three independent features sharing a migration
-- because they ship together for the same client-mobile-app feature.

-- ---------------------------------------------------------------------------
-- Workout sessions: a client's execution of a program_day. Kept separate
-- from program_items (the prescription) rather than extending it, because
-- program_items doubles as a clonable template row (client_id nullable,
-- see 20260801000016_program_templates.sql) — logging real performance onto
-- a row that can be null-client'd as a template would corrupt the
-- template/instance distinction. workout_set_logs references program_items
-- to compare what was done against what was prescribed, but never mutates it.
-- ---------------------------------------------------------------------------
create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  program_day_id uuid not null references public.program_days (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_seconds int,
  created_at timestamptz not null default now()
);

create table public.workout_set_logs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  program_item_id uuid not null references public.program_items (id) on delete cascade,
  set_index int not null,
  weight numeric,
  reps int,
  completed_at timestamptz not null default now()
);

create index workout_sessions_coach_id_idx on public.workout_sessions (coach_id);
create index workout_sessions_client_id_idx on public.workout_sessions (client_id, started_at desc);
create index workout_set_logs_coach_id_idx on public.workout_set_logs (coach_id);
create index workout_set_logs_session_id_idx on public.workout_set_logs (session_id);

alter table public.workout_sessions enable row level security;
alter table public.workout_set_logs enable row level security;

-- Client-authored performance data: the client owns it, the coach reviews
-- it — same split as checkins/body_metrics/media (20260731000009_progress.sql).
create policy coach_read on public.workout_sessions for select to authenticated
  using (coach_id = (select private.coach_id()));
create policy client_own on public.workout_sessions for all to authenticated
  using (client_id = (select private.client_id()))
  with check (client_id = (select private.client_id()));

create policy coach_read on public.workout_set_logs for select to authenticated
  using (coach_id = (select private.coach_id()));
create policy client_own on public.workout_set_logs for all to authenticated
  using (client_id = (select private.client_id()))
  with check (client_id = (select private.client_id()));

grant select, insert, update, delete on public.workout_sessions to authenticated;
grant select, insert, update, delete on public.workout_set_logs to authenticated;
grant select, insert, update, delete on public.workout_sessions to service_role;
grant select, insert, update, delete on public.workout_set_logs to service_role;

-- ---------------------------------------------------------------------------
-- Messages: one thread per client, coach and client both read/write their
-- own thread (unlike checkins' one-sided split — both parties author here),
-- same two-sided shape as programs' coach_rw + a client-side all-CRUD
-- equivalent (20260731000008_plans.sql). sender_role is trusted from the
-- inserting row's own coach_id/client_id match, not re-derived: a coach can
-- only insert rows where coach_id = their own id, a client only where
-- client_id = their own id, so the policy already prevents impersonation.
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  sender_role text not null check (sender_role in ('coach', 'client')),
  body text not null check (char_length(body) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_client_id_idx on public.messages (client_id, created_at);
create index messages_coach_id_idx on public.messages (coach_id);

alter table public.messages enable row level security;

create policy coach_rw on public.messages for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));
create policy client_rw on public.messages for all to authenticated
  using (client_id = (select private.client_id()))
  with check (client_id = (select private.client_id()));

grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.messages to service_role;

-- A new message notifies the OTHER party. coaches.id = profiles.id (1:1,
-- see 20260731000003_coaches.sql), so coach_id is directly usable as a
-- profile_id; clients.profile_id resolves the client side. security definer
-- because the sender has no update/insert policy on notifications for the
-- recipient's profile_id (only their own, via read_own/update_own in
-- 20260801000015_library_source.sql).
create function private.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_profile_id uuid;
begin
  if new.sender_role = 'coach' then
    select profile_id into v_recipient_profile_id
    from public.clients where id = new.client_id;
  else
    v_recipient_profile_id := new.coach_id;
  end if;

  if v_recipient_profile_id is not null then
    insert into public.notifications (profile_id, kind, payload)
    values (
      v_recipient_profile_id,
      'new_message',
      jsonb_build_object('message_id', new.id, 'sender_role', new.sender_role)
    );
  end if;

  return new;
end;
$$;

create trigger messages_notify_recipient
  after insert on public.messages
  for each row execute function private.notify_on_message();

-- ---------------------------------------------------------------------------
-- Check-in: sleep hours. Additive, nullable — no backfill needed. Adherence
-- stays 0-100 (existing column, existing coach-dashboard stats untouched);
-- the mobile app's 1-10 tap-scale is a UI affordance mapping onto this same
-- range, not a schema change.
-- ---------------------------------------------------------------------------
alter table public.checkins add column sleep_hours numeric;
