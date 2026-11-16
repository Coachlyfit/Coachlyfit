-- Appointments: coach <-> client 1:1 sessions (online or in person).
-- Named "appointments" on purpose: workout_sessions already means workouts.
--
-- Who can do what:
--   owner / member  read per assignment (accessible_client_ids), write for
--                   active clients; owner alone edits availability + settings
--   client          sees own rows, creates "requested" ones, cancels (or asks
--                   to reschedule) up to the coach's cutoff -- the column rules
--                   live in private.appointments_guard(), RLS can't express them
--   admin           read-only
--
-- Gated by the `appointments` plan flag (Pro and above) and the lapsed /
-- suspended coach guard, like the other coach-owned tables.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Display timezone per user (IANA name). Times are stored in UTC everywhere.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column timezone text not null default 'Africa/Cairo'
    check (char_length(timezone) between 1 and 64);

-- profiles is column-granted (20261023000001): a new column needs its own.
grant update (timezone) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Plan flag
-- ---------------------------------------------------------------------------
update public.subscription_tiers
set features = features || jsonb_build_object('appointments', key in ('pro', 'elite'));

-- ---------------------------------------------------------------------------
-- Booking guard: lapsed subscription or suspended account cannot take bookings.
-- Security definer because a client can't read profiles.suspended_at.
-- ---------------------------------------------------------------------------
create function private.coach_can_book(p_coach_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.coach_has_access(p_coach_id)
    and not exists (
      select 1 from public.profiles p
      where p.id = p_coach_id and p.suspended_at is not null
    );
$$;

revoke execute on function private.coach_can_book(uuid) from public, anon;
grant execute on function private.coach_can_book(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Settings, weekly availability, days off
-- ---------------------------------------------------------------------------
create table public.coach_appointment_settings (
  coach_id uuid primary key references public.coaches (id) on delete cascade,
  cancel_cutoff_hours int not null default 12 check (cancel_cutoff_hours between 0 and 336),
  slot_minutes int not null default 60 check (slot_minutes between 15 and 240),
  min_notice_hours int not null default 2 check (min_notice_hours between 0 and 168),
  updated_at timestamptz not null default now()
);

create table public.coach_availability (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  timezone text not null default 'Africa/Cairo' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index coach_availability_coach_idx on public.coach_availability (coach_id, weekday);

create table public.coach_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  date date not null,
  is_off boolean not null default true,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  unique (coach_id, date),
  -- A working exception needs hours; a day off carries none.
  check (
    (is_off and start_time is null and end_time is null)
    or (not is_off and start_time is not null and end_time is not null and end_time > start_time)
  )
);

alter table public.coach_appointment_settings enable row level security;
alter table public.coach_availability enable row level security;
alter table public.coach_availability_exceptions enable row level security;

-- Read: the whole tenant (members see it, clients need it to find free slots).
-- Write: coach_id references coaches(id), so coach_id = auth.uid() is the owner.
create policy tenant_read on public.coach_appointment_settings
  for select to authenticated using (coach_id = (select private.tenant_id()));
create policy owner_write on public.coach_appointment_settings
  for all to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

create policy tenant_read on public.coach_availability
  for select to authenticated using (coach_id = (select private.tenant_id()));
create policy owner_write on public.coach_availability
  for all to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

create policy tenant_read on public.coach_availability_exceptions
  for select to authenticated using (coach_id = (select private.tenant_id()));
create policy owner_write on public.coach_availability_exceptions
  for all to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

grant select, insert, update, delete on public.coach_appointment_settings to authenticated, service_role;
grant select, insert, update, delete on public.coach_availability to authenticated, service_role;
grant select, insert, update, delete on public.coach_availability_exceptions to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  type text not null check (type in ('online', 'in_person')),
  location_or_link text check (char_length(location_or_link) <= 500),
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'cancelled', 'completed', 'no_show')),
  notes text check (char_length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancel_reason text check (char_length(cancel_reason) <= 500),
  -- A client asking to move a confirmed session; the coach reschedules (which
  -- clears these) or cancels.
  reschedule_requested_at timestamptz,
  reschedule_note text check (char_length(reschedule_note) <= 500),
  -- Reminder claims (set by the cron with the service role, never by users).
  reminded_24h_at timestamptz,
  reminded_1h_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- A pending request holds its slot, otherwise two could be confirmed over it.
  constraint appointments_no_coach_overlap exclude using gist (
    coach_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status in ('requested', 'confirmed')),
  constraint appointments_no_client_overlap exclude using gist (
    client_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status in ('requested', 'confirmed'))
);

create index appointments_coach_starts_idx on public.appointments (coach_id, starts_at);
create index appointments_client_starts_idx on public.appointments (client_id, starts_at);
create index appointments_confirmed_starts_idx on public.appointments (starts_at) where status = 'confirmed';

-- Everything RLS can't express about an appointment row. A null auth.uid() is
-- the service role (cron claims, seeding) or a cascade: no role rules for it.
create function private.appointments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_client boolean := (select auth.uid()) is not null and (select private.client_id()) is not null;
  v_cutoff int;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(v_uid, new.created_by);
    new.cancelled_by := null;
    new.cancel_reason := null;
    new.reschedule_requested_at := null;
    new.reschedule_note := null;
    new.reminded_24h_at := null;
    new.reminded_1h_at := null;

    if new.status not in ('requested', 'confirmed') then
      raise exception 'A new appointment is requested or confirmed.'
        using errcode = '23514', hint = 'invalid_status';
    end if;

    if v_is_client and new.starts_at <= now() then
      raise exception 'The session must be in the future.'
        using errcode = '23514', hint = 'in_the_past';
    end if;

    if not exists (
      select 1 from public.clients c where c.id = new.client_id and c.coach_id = new.coach_id
    ) then
      raise exception 'The client does not belong to this coach.'
        using errcode = '23514', hint = 'invalid_client';
    end if;
  else
    if new.coach_id is distinct from old.coach_id or new.client_id is distinct from old.client_id then
      raise exception 'An appointment cannot move to another coach or client.' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;

    if v_uid is not null then
      new.reminded_24h_at := old.reminded_24h_at;
      new.reminded_1h_at := old.reminded_1h_at;
    end if;

    if v_is_client then
      -- A client may cancel, or ask to reschedule, a live appointment. Nothing else.
      if old.status not in ('requested', 'confirmed') then
        raise exception 'This appointment can no longer be changed.' using errcode = '42501';
      end if;
      if (new.starts_at, new.ends_at, new.type, new.location_or_link, new.notes)
         is distinct from
         (old.starts_at, old.ends_at, old.type, old.location_or_link, old.notes) then
        raise exception 'Clients cannot edit the session details.' using errcode = '42501';
      end if;

      select coalesce(
        (select s.cancel_cutoff_hours from public.coach_appointment_settings s where s.coach_id = new.coach_id),
        12
      ) into v_cutoff;

      new.updated_at := now();

      if new.status is distinct from old.status then
        if new.status <> 'cancelled' then
          raise exception 'Clients can only cancel.' using errcode = '42501';
        end if;
        if old.status = 'confirmed' and old.starts_at - make_interval(hours => v_cutoff) < now() then
          raise exception 'Too late to cancel online; contact your coach.'
            using errcode = '23514', hint = 'cutoff_passed';
        end if;
        new.cancelled_by := v_uid;
      else
        new.cancel_reason := old.cancel_reason;
        new.cancelled_by := old.cancelled_by;
      end if;

      if new.reschedule_requested_at is distinct from old.reschedule_requested_at
         or new.reschedule_note is distinct from old.reschedule_note then
        if old.status <> 'confirmed' then
          raise exception 'Only a confirmed session can be rescheduled.' using errcode = '42501';
        end if;
        if old.starts_at - make_interval(hours => v_cutoff) < now() then
          raise exception 'Too late to reschedule online; contact your coach.'
            using errcode = '23514', hint = 'cutoff_passed';
        end if;
        new.reschedule_requested_at := now();
      end if;

      return new;
    end if;

    -- Coach / member / service role.
    if v_uid is not null then
      if new.status is distinct from old.status
         and not (
           (old.status = 'requested' and new.status in ('confirmed', 'cancelled'))
           or (old.status = 'confirmed' and new.status in ('cancelled', 'completed', 'no_show'))
         ) then
        raise exception 'This status change is not allowed.'
          using errcode = '23514', hint = 'invalid_transition';
      end if;
      if new.status in ('completed', 'no_show') and new.status is distinct from old.status
         and old.starts_at > now() then
        raise exception 'The session has not started yet.'
          using errcode = '23514', hint = 'not_started';
      end if;
      if (new.starts_at, new.ends_at, new.type, new.location_or_link)
         is distinct from
         (old.starts_at, old.ends_at, old.type, old.location_or_link)
         and old.status not in ('requested', 'confirmed') then
        raise exception 'A finished appointment cannot be edited.'
          using errcode = '23514', hint = 'invalid_transition';
      end if;
    end if;

    if new.status = 'cancelled' and old.status <> 'cancelled' then
      new.cancelled_by := coalesce(v_uid, new.cancelled_by);
    elsif new.status <> 'cancelled' then
      new.cancelled_by := old.cancelled_by;
      new.cancel_reason := old.cancel_reason;
    end if;

    -- Moved: the pending request is answered and the reminders fire again.
    if new.starts_at is distinct from old.starts_at then
      new.reschedule_requested_at := null;
      new.reschedule_note := null;
      new.reminded_24h_at := null;
      new.reminded_1h_at := null;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger appointments_guard
  before insert or update on public.appointments
  for each row execute function private.appointments_guard();

-- Turns a Starter coach's refusal into the 'upgrade_required' hint the server
-- actions map to the upgrade prompt. Also fires for client-created rows, so a
-- client cannot book a coach whose plan has no scheduling.
create trigger appointments_require_feature
  before insert on public.appointments
  for each row execute function private.require_feature('appointments');

alter table public.appointments enable row level security;

create policy coach_read on public.appointments
  for select to authenticated
  using (
    coach_id = (select private.coach_id())
    and ((select private.is_team_owner()) or client_id in (select private.accessible_client_ids()))
  );

create policy coach_insert on public.appointments
  for insert to authenticated
  with check (
    coach_id = (select private.coach_id())
    and client_id in (select private.active_client_ids())
  );

create policy coach_update on public.appointments
  for update to authenticated
  using (
    coach_id = (select private.coach_id())
    and ((select private.is_team_owner()) or client_id in (select private.accessible_client_ids()))
  )
  with check (
    coach_id = (select private.coach_id())
    and client_id in (select private.active_client_ids())
  );

create policy client_read_own on public.appointments
  for select to authenticated
  using (client_id = (select private.client_id()));

create policy client_insert_requested on public.appointments
  for insert to authenticated
  with check (
    client_id = (select private.client_id())
    and coach_id = (select private.tenant_id())
    and status = 'requested'
    and created_by = (select auth.uid())
  );

create policy client_update_own on public.appointments
  for update to authenticated
  using (client_id = (select private.client_id()))
  with check (client_id = (select private.client_id()));

create policy admin_read on public.appointments
  for select to authenticated
  using ((select private.is_admin()));

-- Lapsed or suspended coaches take no new bookings, whoever creates the row.
-- (The shared guard in 20261017000002 skips clients; this one must not.)
create policy coach_can_book_insert on public.appointments as restrictive for insert to authenticated
  with check ((select private.coach_can_book(coach_id)));
-- Edits by the coach side stop when the subscription lapses; a client can
-- still cancel.
create policy coach_access_update on public.appointments as restrictive for update to authenticated
  with check ((select private.coach_id()) is null
              or (select private.coach_has_access((select private.coach_id()))));

grant select, insert, update on public.appointments to authenticated;
grant select, insert, update, delete on public.appointments to service_role;

-- ---------------------------------------------------------------------------
-- Notifications, as ordinary rows: they show in the bell and go out through
-- the existing email / push queue.
--   appointment_requested   client -> coach (+ assigned member); also a
--                           reschedule request (payload.reschedule = true)
--   appointment_confirmed   -> client
--   appointment_cancelled   -> the other party
--   appointment_rescheduled coach moved it -> client
-- Reminders are time-based: see the appointment-reminders cron.
-- ---------------------------------------------------------------------------
create function private.notify_on_appointment()
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

  -- To the coach side: the owner and the assigned member.
  if (tg_op = 'INSERT' and new.status = 'requested')
     or (tg_op = 'UPDATE' and new.reschedule_requested_at is not null
         and old.reschedule_requested_at is null) then
    for v_rcpt in
      select distinct x from unnest(array[new.coach_id, v_assigned]) as x where x is not null
    loop
      insert into public.notifications (profile_id, kind, payload)
      values (v_rcpt, 'appointment_requested',
        v_payload || jsonb_build_object('name', v_client_name, 'reschedule', tg_op = 'UPDATE'));
    end loop;
    return new;
  end if;

  -- Everything below tells the client; one with no account yet can't be told.
  if v_profile is null then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'confirmed' and not v_actor_is_client then
    insert into public.notifications (profile_id, kind, payload)
    values (v_profile, 'appointment_confirmed', v_payload || jsonb_build_object('name', v_coach_name));

  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' then
    if v_actor_is_client then
      for v_rcpt in
        select distinct x from unnest(array[new.coach_id, v_assigned]) as x where x is not null
      loop
        insert into public.notifications (profile_id, kind, payload)
        values (v_rcpt, 'appointment_cancelled', v_payload || jsonb_build_object('name', v_client_name));
      end loop;
    else
      insert into public.notifications (profile_id, kind, payload)
      values (v_profile, 'appointment_cancelled', v_payload || jsonb_build_object('name', v_coach_name));
    end if;

  elsif tg_op = 'UPDATE' and new.status = 'confirmed' and old.status = 'requested' then
    insert into public.notifications (profile_id, kind, payload)
    values (v_profile, 'appointment_confirmed', v_payload || jsonb_build_object('name', v_coach_name));

  elsif tg_op = 'UPDATE' and new.status in ('requested', 'confirmed')
        and new.starts_at is distinct from old.starts_at then
    insert into public.notifications (profile_id, kind, payload)
    values (v_profile, 'appointment_rescheduled', v_payload || jsonb_build_object('name', v_coach_name));
  end if;

  return new;
end;
$$;

create trigger appointments_notify
  after insert or update on public.appointments
  for each row execute function private.notify_on_appointment();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Busy ranges only (no client data) of the caller's coach, so a client can be
-- offered free slots without ever reading other clients' appointments.
create function public.coach_busy_ranges(p_from timestamptz, p_to timestamptz)
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
    and a.ends_at > p_from;
$$;

revoke execute on function public.coach_busy_ranges(timestamptz, timestamptz) from public, anon;
grant execute on function public.coach_busy_ranges(timestamptz, timestamptz) to authenticated;

-- Can the caller's coach take bookings? Works for a coach, member or client.
create function public.appointments_enabled()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select private.coach_has_feature(t.id, 'appointments') and private.coach_can_book(t.id)
     from (select (select private.tenant_id()) as id) t
     where t.id is not null),
    false
  );
$$;

revoke execute on function public.appointments_enabled() from public, anon;
grant execute on function public.appointments_enabled() to authenticated;

-- Private calendar feed (.ics): one secret token per user, shown to its owner.
create table public.calendar_feed_tokens (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  created_at timestamptz not null default now()
);

alter table public.calendar_feed_tokens enable row level security;

create policy own_all on public.calendar_feed_tokens
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

grant select, insert, update on public.calendar_feed_tokens to authenticated;
grant select, insert, update, delete on public.calendar_feed_tokens to service_role;

-- Feed rows for a token. Anyone holding the token can call it (calendar apps
-- have no session), so it returns display-safe columns only: no notes, no
-- contact details. The token is 256 bits, looked up by unique index.
create function public.calendar_feed(p_token text)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  type text,
  location_or_link text,
  status text,
  counterpart_name text,
  viewer_role text
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
    case when c.profile_id = t.profile_id then 'client' else 'coach' end
  from public.calendar_feed_tokens t
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
