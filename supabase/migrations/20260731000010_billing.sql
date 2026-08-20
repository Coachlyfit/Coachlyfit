create table public.subscription_tiers (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('starter', 'pro', 'elite')),
  name_ar text not null,
  name_en text not null,
  price_egp_monthly numeric not null,
  max_clients int not null,
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.subscription_tiers enable row level security;

-- Pricing must be readable pre-signup (marketing/pricing page), so this is
-- the one table in the schema with an anon select policy.
create policy public_read on public.subscription_tiers
  for select to anon, authenticated
  using (is_active);
create policy admin_write on public.subscription_tiers
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

grant select on public.subscription_tiers to anon;
grant select, insert, update, delete on public.subscription_tiers to authenticated;
grant select, insert, update, delete on public.subscription_tiers to service_role;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null unique references public.coaches (id) on delete cascade,
  tier_id uuid not null references public.subscription_tiers (id),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Read-only for everyone, including the coach who owns it: writes happen
-- exclusively through record_payment() (admin) or the cron lifecycle route
-- (service_role, bypasses RLS entirely) — never a direct table write from
-- the app, so a coach can't grant themself an extended period.
create policy coach_read on public.subscriptions for select to authenticated
  using (coach_id = (select private.coach_id()));
create policy admin_read on public.subscriptions for select to authenticated
  using (private.is_admin());

grant select on public.subscriptions to authenticated;
-- The cron lifecycle route updates status/current_period_end directly as
-- service_role (see Phase 7) — that's the one place this table is written.
grant select, insert, update, delete on public.subscriptions to service_role;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id),
  amount_egp numeric not null,
  method text not null check (method in ('instapay', 'bank_transfer', 'vodafone_cash', 'cash')),
  reference text,
  period_start date not null,
  period_end date not null,
  recorded_by uuid references public.profiles (id),
  provider text not null default 'manual',
  created_at timestamptz not null default now()
);

create index payments_coach_id_idx on public.payments (coach_id);

alter table public.payments enable row level security;

create policy coach_read on public.payments for select to authenticated
  using (coach_id = (select private.coach_id()));
create policy admin_read on public.payments for select to authenticated
  using (private.is_admin());

grant select on public.payments to authenticated;
grant select, insert, update, delete on public.payments to service_role;

-- New coach -> trial subscription on the cheapest active tier. Runs after
-- handle_new_user()'s insert into public.coaches (see 20260731000003).
create function private.start_trial_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier_id uuid;
begin
  select id into v_tier_id
  from public.subscription_tiers
  where is_active
  order by price_egp_monthly asc
  limit 1;

  if v_tier_id is not null then
    insert into public.subscriptions (coach_id, tier_id, status, trial_ends_at, current_period_end)
    values (new.id, v_tier_id, 'trialing', now() + interval '14 days', now() + interval '14 days');
  end if;

  return new;
end;
$$;

create trigger on_coach_created
  after insert on public.coaches
  for each row execute function private.start_trial_subscription();

-- The one write path into payments/subscriptions from the app. Admin-only
-- (manual billing model: InstaPay/bank transfer/Vodafone Cash/cash,
-- recorded by a human after they see the money land). Adding Paymob later
-- means one new route that verifies its webhook HMAC and calls this same
-- function with p_provider = 'paymob' — nothing here needs to change.
create function public.record_payment(
  p_coach_id uuid,
  p_amount_egp numeric,
  p_method text,
  p_period_start date,
  p_period_end date,
  p_reference text default null,
  p_provider text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription_id uuid;
  v_payment_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Only an admin can record a payment.' using errcode = '42501';
  end if;

  select id into v_subscription_id
  from public.subscriptions
  where coach_id = p_coach_id;

  if v_subscription_id is null then
    raise exception 'No subscription found for that coach.' using errcode = 'P0002';
  end if;

  insert into public.payments (
    coach_id, subscription_id, amount_egp, method, reference,
    period_start, period_end, recorded_by, provider
  )
  values (
    p_coach_id, v_subscription_id, p_amount_egp, p_method, p_reference,
    p_period_start, p_period_end, (select auth.uid()), p_provider
  )
  returning id into v_payment_id;

  update public.subscriptions
  set status = 'active', current_period_end = p_period_end
  where id = v_subscription_id;

  return v_payment_id;
end;
$$;

revoke execute on function public.record_payment(uuid, numeric, text, date, date, text, text) from public;
grant execute on function public.record_payment(uuid, numeric, text, date, date, text, text) to authenticated;

-- Entitlement enforced in the DB, not just the UI: a coach at their tier's
-- client cap cannot insert another client row, full stop.
create function private.enforce_client_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
  v_count int;
begin
  select t.max_clients into v_max
  from public.subscriptions s
  join public.subscription_tiers t on t.id = s.tier_id
  where s.coach_id = new.coach_id;

  if v_max is null then
    return new; -- no subscription row yet (shouldn't happen post-signup); don't block.
  end if;

  select count(*) into v_count
  from public.clients
  where coach_id = new.coach_id and status <> 'archived';

  if v_count >= v_max then
    raise exception 'Client limit reached for your current plan.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger clients_enforce_cap
  before insert on public.clients
  for each row execute function private.enforce_client_cap();
