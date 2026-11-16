-- Google Calendar sync, pull side: watch channels + webhook ping, freebusy
-- cache for slot generation, "moved in Google" proposals, per-appointment sync
-- status and manual retry.
--
-- Same boundary as 20261123000002: the watch / busy tables are service_role
-- only. The few things a normal request path must do (answer Google's webhook,
-- show sync state, retry a job, disconnect) go through narrow security-definer
-- functions that act on the caller's own tenant or on a secret channel token.

-- ---------------------------------------------------------------------------
-- Watch channels: one per connection, on the "Coachly Fit" calendar. Google
-- channels expire after about a week, so the daily job renews them.
-- ---------------------------------------------------------------------------
create table public.google_watch_channels (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique references public.google_connections (id) on delete cascade,
  channel_id text not null unique,
  resource_id text not null,
  -- Random secret we hand Google; it echoes it in X-Goog-Channel-Token so the
  -- webhook can tell a real notification from a forged one.
  channel_token text not null,
  expires_at timestamptz not null,
  -- Calendar-level incremental sync token (kept across channel renewals).
  sync_token text,
  -- Set by the webhook; the sync run clears it once it has pulled the changes.
  dirty_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.google_watch_channels enable row level security;
revoke all on public.google_watch_channels from anon, authenticated;
grant select, insert, update, delete on public.google_watch_channels to service_role;

-- The webhook's only database access. Anyone can call it, but it only does
-- anything for a (channel id, token) pair we issued, and it reveals nothing:
-- false for an unknown channel (the route answers 404 and Google stops).
create function public.google_webhook_ping(p_channel_id text, p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with hit as (
    update public.google_watch_channels
    set dirty_at = now()
    where channel_id = p_channel_id and channel_token = p_token
    returning 1
  )
  select exists (select 1 from hit);
$$;

revoke execute on function public.google_webhook_ping(text, text) from public;
grant execute on function public.google_webhook_ping(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Freebusy cache. The sync cron asks Google for the coach's busy times and
-- stores only start/end here; slot generation reads it through
-- coach_busy_ranges, so neither a client's nor a coach's request ever calls
-- Google (or touches the token).
-- ---------------------------------------------------------------------------
create table public.google_busy_blocks (
  coach_id uuid not null references public.coaches (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);

create index google_busy_blocks_coach_idx on public.google_busy_blocks (coach_id, starts_at);

alter table public.google_busy_blocks enable row level security;
revoke all on public.google_busy_blocks from anon, authenticated;
grant select, insert, update, delete on public.google_busy_blocks to service_role;

create function public.replace_google_busy(p_coach_id uuid, p_blocks jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.google_busy_blocks where coach_id = p_coach_id;
  insert into public.google_busy_blocks (coach_id, starts_at, ends_at)
  select p_coach_id, x.starts_at, x.ends_at
  from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(starts_at timestamptz, ends_at timestamptz)
  where x.ends_at > x.starts_at;
end;
$$;

revoke execute on function public.replace_google_busy(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_google_busy(uuid, jsonb) to service_role;

-- Same signature as before: appointments, now plus Google busy time.
create or replace function public.coach_busy_ranges(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
security definer
stable
set search_path = ''
as $$
  select a.starts_at, a.ends_at
  from public.appointments a
  where a.coach_id = (select private.tenant_id())
    and a.status in ('requested', 'confirmed')
    and a.starts_at < p_to
    and a.ends_at > p_from
  union all
  select b.starts_at, b.ends_at
  from public.google_busy_blocks b
  where b.coach_id = (select private.tenant_id())
    and b.starts_at < p_to
    and b.ends_at > p_from;
$$;

-- ---------------------------------------------------------------------------
-- "Moved in Google": the proposed new time. Written only by the sync worker.
-- ---------------------------------------------------------------------------
alter table public.appointments
  add column proposed_starts_at timestamptz,
  add column proposed_ends_at timestamptz;

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
      new.proposed_starts_at := null;
      new.proposed_ends_at := null;
    else
      new.google_event_id := old.google_event_id;
      new.google_etag := old.google_etag;
      new.last_synced_at := old.last_synced_at;
      new.proposed_starts_at := old.proposed_starts_at;
      new.proposed_ends_at := old.proposed_ends_at;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sync state per appointment, and a manual retry.
-- ---------------------------------------------------------------------------
create function public.appointment_sync_status(p_ids uuid[])
returns table (appointment_id uuid, state text)
language sql
security definer
stable
set search_path = ''
as $$
  select
    a.id,
    case
      when exists (
        select 1 from public.google_sync_jobs j
        where j.appointment_id = a.id and j.status in ('pending', 'processing')
      ) then 'pending'
      when (
        select j.status from public.google_sync_jobs j
        where j.appointment_id = a.id order by j.created_at desc limit 1
      ) = 'dead' then 'failed'
      when a.last_synced_at is not null then 'synced'
      else 'pending'
    end
  from public.appointments a
  where a.id = any (p_ids)
    and a.coach_id = (select private.coach_id())
    and ((select private.is_team_owner()) or a.client_id in (select private.accessible_client_ids()))
    and exists (
      select 1 from public.google_connections g where g.coach_id = a.coach_id and g.status = 'active'
    );
$$;

revoke execute on function public.appointment_sync_status(uuid[]) from public, anon;
grant execute on function public.appointment_sync_status(uuid[]) to authenticated;

create function public.retry_google_sync(p_appointment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid;
begin
  select a.coach_id into v_coach
  from public.appointments a
  where a.id = p_appointment_id
    and a.coach_id = (select private.coach_id())
    and ((select private.is_team_owner()) or a.client_id in (select private.accessible_client_ids()));
  if v_coach is null then
    raise exception 'Appointment not found.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.google_connections g where g.coach_id = v_coach and g.status = 'active') then
    return false;
  end if;

  insert into public.google_sync_jobs (coach_id, appointment_id)
  values (v_coach, p_appointment_id)
  on conflict (appointment_id) where status = 'pending'
  do update set next_attempt_at = now(), attempts = 0, last_error = null;
  return true;
end;
$$;

revoke execute on function public.retry_google_sync(uuid) from public, anon;
grant execute on function public.retry_google_sync(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Disconnect now also hands back the watch channel, so the server can stop it
-- at Google (the row is deleted here, and the channel with it).
-- ---------------------------------------------------------------------------
drop function public.google_disconnect();

create function public.google_disconnect()
returns table (token text, calendar text, channel_id text, resource_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_channel text;
  v_resource text;
  v_token text;
  v_calendar text;
begin
  if v_uid is null or not exists (select 1 from public.coaches where id = v_uid) then
    raise exception 'Only the account owner can disconnect Google Calendar.' using errcode = '42501';
  end if;

  select w.channel_id, w.resource_id into v_channel, v_resource
  from public.google_watch_channels w
  join public.google_connections g on g.id = w.connection_id
  where g.coach_id = v_uid;

  delete from public.google_sync_jobs where coach_id = v_uid;
  delete from public.google_busy_blocks where coach_id = v_uid;

  delete from public.google_connections g
  where g.coach_id = v_uid
  returning g.encrypted_refresh_token, g.calendar_id into v_token, v_calendar;

  if v_token is not null then
    return query select v_token, v_calendar, v_channel, v_resource;
  end if;
end;
$$;

revoke execute on function public.google_disconnect() from public, anon;
grant execute on function public.google_disconnect() to authenticated;

-- ---------------------------------------------------------------------------
-- Reconnecting creates a *new* calendar, so the old channel and its sync token
-- are meaningless. Drop them here: otherwise the next pull would list the new
-- calendar with the old token, get a 410, and read every already-synced
-- appointment as "deleted in Google". The new channel starts from a baseline.
-- (Same signature as in 20261123000003.)
-- ---------------------------------------------------------------------------
create or replace function public.google_connect(
  p_encrypted_refresh_token text,
  p_calendar_id text,
  p_email text,
  p_scopes text[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_previous text;
begin
  if v_uid is null or not exists (select 1 from public.coaches where id = v_uid) then
    raise exception 'Only the account owner can connect Google Calendar.' using errcode = '42501';
  end if;
  if not private.coach_has_feature(v_uid, 'appointments') then
    raise exception 'Your plan does not include scheduling.' using errcode = 'P0001', hint = 'upgrade_required';
  end if;

  select g.calendar_id into v_previous from public.google_connections g where g.coach_id = v_uid;

  delete from public.google_watch_channels w
  using public.google_connections g
  where w.connection_id = g.id and g.coach_id = v_uid;
  delete from public.google_busy_blocks where coach_id = v_uid;

  insert into public.google_connections
    (coach_id, encrypted_refresh_token, calendar_id, google_email, status, scopes, connected_at, last_sync_at)
  values
    (v_uid, p_encrypted_refresh_token, p_calendar_id, nullif(p_email, ''), 'active', coalesce(p_scopes, '{}'), now(), null)
  on conflict (coach_id) do update set
    encrypted_refresh_token = excluded.encrypted_refresh_token,
    calendar_id = excluded.calendar_id,
    google_email = excluded.google_email,
    status = 'active',
    scopes = excluded.scopes,
    connected_at = excluded.connected_at,
    last_sync_at = null;

  insert into public.google_sync_jobs (coach_id, appointment_id)
  select a.coach_id, a.id
  from public.appointments a
  where a.coach_id = v_uid and a.status in ('requested', 'confirmed') and a.ends_at > now()
  on conflict (appointment_id) where status = 'pending' do nothing;

  return v_previous;
end;
$$;
