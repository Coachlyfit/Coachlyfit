-- Renewal and dunning notices for coaches. The billing-lifecycle cron only
-- flipped statuses; a coach found out their trial ended by being locked out.
--
-- A notice is an ordinary notifications row (kinds subscription_*), so it
-- shows in the bell and goes out through the existing delivery queue in the
-- coach's own locale. What's new here is only the "once per period" record.

-- One row per notice actually queued. period_end is the deadline the notice
-- is about, so renewing (a new period) makes the same kind due again.
create table public.subscription_notices (
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  kind text not null check (kind in ('trial_ending', 'renewal_due', 'past_due', 'canceled')),
  period_end timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (subscription_id, kind, period_end)
);

alter table public.subscription_notices enable row level security;

-- No policies: internal to the cron, same shape as notification_deliveries.
revoke all on public.subscription_notices from anon, authenticated;
grant select, insert, update, delete on public.subscription_notices to service_role;

-- Records the notice and queues the notification in one transaction, so a
-- cron run that is retried or overlaps another can't send it twice. Returns
-- false when this notice was already sent for this period. Goes to the
-- tenant owner (coaches.id is the owner's profile id), not team members.
create function public.queue_subscription_notice(
  p_subscription_id uuid,
  p_kind text,
  p_period_end timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid;
begin
  select coach_id into v_coach_id from public.subscriptions where id = p_subscription_id;
  if v_coach_id is null then
    return false;
  end if;

  insert into public.subscription_notices (subscription_id, kind, period_end)
  values (p_subscription_id, p_kind, p_period_end)
  on conflict do nothing;

  if not found then
    return false;
  end if;

  insert into public.notifications (profile_id, kind, payload)
  values (v_coach_id, 'subscription_' || p_kind, jsonb_build_object('period_end', p_period_end));

  return true;
end;
$$;

revoke execute on function public.queue_subscription_notice(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.queue_subscription_notice(uuid, text, timestamptz) to service_role;

-- Subscription notices are account notices, not activity updates: they are
-- emailed even when the coach turned email notifications off. The address
-- suppression list (bounces, unsubscribes) still applies in the cron route.
-- Otherwise unchanged from 20261001000001.
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

  if (coalesce(v_wants_email, true) and new.kind <> 'nutrition_log_reminder')
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
