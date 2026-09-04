-- Web push subscriptions, one row per browser/device a profile has opted
-- in on. Scoped by profile_id in both RLS and every delete -- the
-- reference platform's mistake was deleting a subscription by endpoint
-- alone (no owner check), which lets anyone unsubscribe anyone else's
-- device; here a subscriber can only see/delete their own rows, and the
-- cron (service_role) is the only other writer.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_profile_id_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_own on public.push_subscriptions
  for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, delete on public.push_subscriptions to service_role;

-- Renamed from queue_notification_email (20260903000001) now that it also
-- queues push -- create or replace can't rename, so the old name is
-- dropped and the trigger repointed at this one below. Extends the
-- original email-only logic to also queue a push delivery, but only when
-- the profile actually has at least one subscription -- no point queuing
-- (and retrying) a send with nothing to deliver to. Email's own opt-out
-- (email_notifications) is unrelated: push has no separate toggle, having
-- a subscription IS the opt-in.
create function private.queue_notification_deliveries()
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

  if coalesce(v_wants_email, true) then
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

drop trigger notifications_queue_email on public.notifications;
create trigger notifications_queue_deliveries
  after insert on public.notifications
  for each row execute function private.queue_notification_deliveries();

drop function private.queue_notification_email();
