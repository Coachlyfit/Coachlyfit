-- ---------------------------------------------------------------------------
-- Unread-message email nudge for coaches. A client message opens (at most) one
-- "waiting" window per thread; if the coach neither replies nor opens the
-- thread within their chosen delay, a cron emails them once. More client
-- messages in the same window never send another. A coach reply or opening
-- the thread closes the window.
--
-- This replaces the instant per-message email for coach recipients (the bell
-- and push are unchanged).
-- ---------------------------------------------------------------------------

-- One row per client thread = the open window. Internal queue: no policy for
-- `authenticated`, only the triggers below (security definer) and the cron
-- route's service-role client touch it, same shape as notification_deliveries.
create table public.pending_coach_notifications (
  client_id uuid primary key references public.clients (id) on delete cascade,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  first_unread_at timestamptz not null,
  email_sent boolean not null default false,
  email_sent_at timestamptz
);

create index pending_coach_notifications_due_idx
  on public.pending_coach_notifications (first_unread_at)
  where not email_sent;
create index pending_coach_notifications_coach_id_idx
  on public.pending_coach_notifications (coach_id);

alter table public.pending_coach_notifications enable row level security;

grant select, update on public.pending_coach_notifications to service_role;

-- Covers every way a message can be written (text, voice notes, anything
-- added later) without touching app code.
create function private.track_coach_unread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_role = 'client' then
    -- do nothing on conflict: keeps the window's first timestamp and its
    -- email_sent flag, so a sent nudge is never re-armed by a later message.
    insert into public.pending_coach_notifications (client_id, coach_id, first_unread_at)
    values (new.client_id, new.coach_id, new.created_at)
    on conflict (client_id) do nothing;
  else
    delete from public.pending_coach_notifications where client_id = new.client_id;
  end if;
  return new;
end;
$$;

create trigger messages_track_coach_unread
  after insert on public.messages
  for each row execute function private.track_coach_unread();

-- The coach (or a team member) opened the thread: markThreadRead stamps
-- read_at on the client's messages.
create function private.clear_coach_unread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.pending_coach_notifications where client_id = new.client_id;
  return new;
end;
$$;

create trigger messages_clear_coach_unread
  after update of read_at on public.messages
  for each row
  when (new.sender_role = 'client' and old.read_at is null and new.read_at is not null)
  execute function private.clear_coach_unread();

-- Coach setting: delay in minutes, null = no nudge emails. profiles has
-- column-level update grants (20261023000001), so the new column needs its own.
alter table public.profiles
  add column message_nudge_minutes int default 60
  check (message_nudge_minutes is null or message_nudge_minutes in (30, 60, 120));

grant update (message_nudge_minutes) on public.profiles to authenticated;

-- A client's message no longer emails the coach straight away: the nudge above
-- does it, once, if they stay silent. Otherwise unchanged from 20261017000003.
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

  if (
       coalesce(v_wants_email, true)
       and new.kind <> 'nutrition_log_reminder'
       and not (new.kind = 'new_message' and new.payload ->> 'sender_role' = 'client')
     )
     or new.kind like 'subscription\_%' then
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
