-- Email delivery queue for notifications. Every notifications row already
-- drives the in-app bell; this adds a second, independent delivery channel
-- fed by the same insert via a trigger, so none of the existing producers
-- (private.notify_on_message, admin_promote_exercise/_food) need to change.
--
-- profiles has no email column (email lives on auth.users only) -- the
-- trigger below reads it from there, which only a security-definer
-- function can do (RLS on auth.users has no policy for `authenticated`).
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'dead')),
  attempts int not null default 0,
  last_error text,
  -- Batches are claimed by send_after <= now(), not created_at -- a failed
  -- attempt reschedules by bumping this forward (see the cron route's
  -- backoff), so "due for another try" and "when it was first queued" are
  -- deliberately different columns.
  send_after timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index notification_deliveries_due_idx
  on public.notification_deliveries (send_after)
  where status = 'pending';
create index notification_deliveries_notification_id_idx
  on public.notification_deliveries (notification_id);

alter table public.notification_deliveries enable row level security;

-- No policies for `authenticated` at all -- this queue is an internal
-- delivery mechanism, not user-facing data (the bell already reads
-- notifications directly). Only the cron route's service-role client
-- touches this table, same "unreachable except through a trusted job"
-- shape as invite_attempts.
grant select, update on public.notification_deliveries to service_role;

alter table public.profiles
  add column email_notifications boolean not null default true;

create table public.email_suppressions (
  email text primary key,
  reason text not null check (reason in ('unsubscribed', 'bounced', 'complained')),
  created_at timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;
grant select, insert on public.email_suppressions to service_role;

-- Fan-out trigger: every notifications insert queues an email delivery
-- (unless the recipient turned email notifications off), independent of
-- whichever producer wrote the notification. security definer because it
-- reads auth.users (no RLS policy exists for `authenticated` there) purely
-- to check email_notifications is still meaningful even without that --
-- the real reason is Postgres requires the same privilege to insert into
-- notification_deliveries, which authenticated has no grant for either.
create function private.queue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wants_email boolean;
begin
  select email_notifications into v_wants_email
  from public.profiles
  where id = new.profile_id;

  if coalesce(v_wants_email, true) then
    insert into public.notification_deliveries (notification_id, channel)
    values (new.id, 'email');
  end if;

  return new;
end;
$$;

create trigger notifications_queue_email
  after insert on public.notifications
  for each row execute function private.queue_notification_email();
