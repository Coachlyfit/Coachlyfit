-- Google Calendar sync (push side) + two follow-ups to 20261123000001.
--
-- Coachly is the source of truth: nothing here can block an appointment write.
-- A trigger only *queues* a sync job; the google-sync cron route processes the
-- queue with the service role, so a Google outage costs a delayed event, not a
-- failed booking.
--
-- Tables below are service_role-only except google_connections, which a coach
-- may read (not its token) for the Settings card.

-- ---------------------------------------------------------------------------
-- Follow-up 1: say who a notification is for, so the push/email link lands on
-- the coach's Schedule or the client's Sessions page.
-- ---------------------------------------------------------------------------
create or replace function private.notify_on_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_profile uuid;
  v_assigned uuid;
  v_client_name text;
  v_coach_name text;
  v_actor_is_client boolean;
  v_rcpt uuid;
  v_payload jsonb;
begin
  select c.profile_id, c.assigned_to, c.display_name
    into v_profile, v_assigned, v_client_name
  from public.clients c where c.id = new.client_id;

  select coalesce(nullif(p.full_name, ''), co.business_name)
    into v_coach_name
  from public.coaches co join public.profiles p on p.id = co.id
  where co.id = new.coach_id;

  v_actor_is_client := v_actor is not null and v_actor = v_profile;

  v_payload := jsonb_build_object(
    'appointment_id', new.id, 'starts_at', new.starts_at, 'type', new.type
  );

  if (tg_op = 'INSERT' and new.status = 'requested')
     or (tg_op = 'UPDATE' and new.reschedule_requested_at is not null
         and old.reschedule_requested_at is null) then
    for v_rcpt in
      select distinct x from unnest(array[new.coach_id, v_assigned]) as x where x is not null
    loop
      insert into public.notifications (profile_id, kind, payload)
      values (v_rcpt, 'appointment_requested',
        v_payload || jsonb_build_object('name', v_client_name, 'reschedule', tg_op = 'UPDATE', 'audience', 'coach'));
    end loop;
    return new;
  end if;

  if v_profile is null then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'confirmed' and not v_actor_is_client then
    insert into public.notifications (profile_id, kind, payload)
    values (v_profile, 'appointment_confirmed',
      v_payload || jsonb_build_object('name', v_coach_name, 'audience', 'client'));

  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' then
    if v_actor_is_client then
      for v_rcpt in
        select distinct x from unnest(array[new.coach_id, v_assigned]) as x where x is not null
      loop
        insert into public.notifications (profile_id, kind, payload)
        values (v_rcpt, 'appointment_cancelled',
          v_payload || jsonb_build_object('name', v_client_name, 'audience', 'coach'));
      end loop;
    else
      insert into public.notifications (profile_id, kind, payload)
      values (v_profile, 'appointment_cancelled',
        v_payload || jsonb_build_object('name', v_coach_name, 'audience', 'client'));
    end if;

  elsif tg_op = 'UPDATE' and new.status = 'confirmed' and old.status = 'requested' then
    insert into public.notifications (profile_id, kind, payload)
    values (v_profile, 'appointment_confirmed',
      v_payload || jsonb_build_object('name', v_coach_name, 'audience', 'client'));

  elsif tg_op = 'UPDATE' and new.status in ('requested', 'confirmed')
        and new.starts_at is distinct from old.starts_at then
    insert into public.notifications (profile_id, kind, payload)
    values (v_profile, 'appointment_rescheduled',
      v_payload || jsonb_build_object('name', v_coach_name, 'audience', 'client'));
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Follow-up 2: the feed knows its owner's language, so event titles are
-- written in it (a calendar app has no locale to tell us).
-- ---------------------------------------------------------------------------
drop function public.calendar_feed(text);

create function public.calendar_feed(p_token text)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  type text,
  location_or_link text,
  status text,
  counterpart_name text,
  viewer_role text,
  viewer_locale text
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    a.id, a.starts_at, a.ends_at, a.type, a.location_or_link, a.status,
    case when c.profile_id = t.profile_id
      then coalesce(nullif(p.full_name, ''), co.business_name)
      else c.display_name end,
    case when c.profile_id = t.profile_id then 'client' else 'coach' end,
    vp.locale::text
  from public.calendar_feed_tokens t
  join public.profiles vp on vp.id = t.profile_id
  join public.appointments a
    on (a.coach_id = t.profile_id
        or a.client_id in (select c2.id from public.clients c2
                           where c2.assigned_to = t.profile_id or c2.profile_id = t.profile_id))
  join public.clients c on c.id = a.client_id and c.deleted_at is null
  join public.coaches co on co.id = a.coach_id
  left join public.profiles p on p.id = a.coach_id
  where t.token = p_token
    and a.starts_at > now() - interval '60 days'
  order by a.starts_at;
$$;

revoke execute on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Google columns on appointments
-- ---------------------------------------------------------------------------
alter table public.appointments
  add column google_event_id text,
  add column google_etag text,
  add column last_synced_at timestamptz;

-- Only the sync worker (service role, null auth.uid()) may write these.
create or replace function private.appointments_protect_google_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    if tg_op = 'INSERT' then
      new.google_event_id := null;
      new.google_etag := null;
      new.last_synced_at := null;
    else
      new.google_event_id := old.google_event_id;
      new.google_etag := old.google_etag;
      new.last_synced_at := old.last_synced_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger appointments_protect_google_columns
  before insert or update on public.appointments
  for each row execute function private.appointments_protect_google_columns();

-- ---------------------------------------------------------------------------
-- google_connections
-- ---------------------------------------------------------------------------
create table public.google_connections (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null unique references public.coaches (id) on delete cascade,
  -- AES-256-GCM, "v1.<iv>.<tag>.<ciphertext>" (src/lib/crypto/token-crypto.ts).
  encrypted_refresh_token text not null,
  calendar_id text not null,
  google_email text,
  status text not null default 'active' check (status in ('active', 'needs_reconnect', 'revoked')),
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz
);

alter table public.google_connections enable row level security;

create policy owner_read on public.google_connections
  for select to authenticated
  using (coach_id = (select auth.uid()));

-- Column grant: the token is never selectable by a user session, whatever the
-- policy says. Writes are service_role only.
revoke all on public.google_connections from anon, authenticated;
grant select (id, coach_id, calendar_id, google_email, status, scopes, connected_at, last_sync_at)
  on public.google_connections to authenticated;
grant select, insert, update, delete on public.google_connections to service_role;

-- ---------------------------------------------------------------------------
-- google_sync_jobs: "sync this appointment" -- state-based, so a retry or a
-- duplicate job is harmless (the worker reads the current row and reconciles).
-- ---------------------------------------------------------------------------
create table public.google_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'dead')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

-- One waiting job per appointment: rapid edits coalesce into a single sync.
create unique index google_sync_jobs_one_pending_idx
  on public.google_sync_jobs (appointment_id) where status = 'pending';
create index google_sync_jobs_due_idx
  on public.google_sync_jobs (next_attempt_at) where status = 'pending';

alter table public.google_sync_jobs enable row level security;
revoke all on public.google_sync_jobs from anon, authenticated;
grant select, insert, update, delete on public.google_sync_jobs to service_role;

-- Queue a sync when an appointment changes and its coach has a live connection
-- on a plan with scheduling. Never raises: queueing must not fail a booking.
create function private.enqueue_google_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (new.starts_at, new.ends_at, new.status, new.type, new.location_or_link)
         is not distinct from
         (old.starts_at, old.ends_at, old.status, old.type, old.location_or_link) then
    return new;
  end if;

  begin
    if exists (
         select 1 from public.google_connections g
         where g.coach_id = new.coach_id and g.status = 'active'
       )
       and private.coach_has_feature(new.coach_id, 'appointments') then
      insert into public.google_sync_jobs (coach_id, appointment_id)
      values (new.coach_id, new.id)
      on conflict (appointment_id) where status = 'pending' do nothing;
    end if;
  exception when others then
    null; -- Coachly stays the source of truth: never fail the booking over the queue.
  end;

  return new;
end;
$$;

create trigger appointments_enqueue_google_sync
  after insert or update on public.appointments
  for each row execute function private.enqueue_google_sync();

-- Claim due jobs for the worker. SKIP LOCKED so overlapping runs split the
-- queue; a job stuck in 'processing' (worker died) is taken again after 5 min.
-- Jobs of connections that need a reconnect wait (they stay pending) and flow
-- again once the coach reconnects.
create function public.claim_google_sync_jobs(p_limit int)
returns setof public.google_sync_jobs
language sql
security definer
set search_path = ''
as $$
  with due as (
    select j.id
    from public.google_sync_jobs j
    join public.google_connections g on g.coach_id = j.coach_id and g.status = 'active'
    where ((j.status = 'pending' and j.next_attempt_at <= now())
        or (j.status = 'processing' and j.locked_at < now() - interval '5 minutes'))
      -- Same plan gate as scheduling itself: a lapsed or suspended coach, or a
      -- plan without the feature, stops syncing (jobs wait, nothing is lost).
      and private.coach_has_feature(j.coach_id, 'appointments')
      and private.coach_can_book(j.coach_id)
    order by j.next_attempt_at
    limit greatest(p_limit, 0)
    for update of j skip locked
  )
  update public.google_sync_jobs j
  set status = 'processing', locked_at = now()
  from due
  where j.id = due.id
  returning j.*;
$$;

revoke execute on function public.claim_google_sync_jobs(int) from public, anon, authenticated;
grant execute on function public.claim_google_sync_jobs(int) to service_role;
