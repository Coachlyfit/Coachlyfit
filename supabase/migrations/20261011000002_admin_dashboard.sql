-- Admin home redesign: the dashboard needs three things the schema never
-- recorded -- when a subscription last changed status (90-day churn,
-- "canceled N days ago"), what MRR was in previous months (the chart), and a
-- few more columns per coach (owner name, list price, last seen). Nothing is
-- backfilled: status_changed_at stays null for rows that changed before this
-- migration and mrr_snapshots starts empty, so the UI hides what it can't
-- back with real data instead of showing inferred numbers.

alter table public.subscriptions add column status_changed_at timestamptz;

-- A trigger rather than an extra SET in each writer: status is written by
-- record_payment() and by the cron lifecycle route (service_role), and this
-- covers both -- and any future writer -- without touching either.
create function private.stamp_subscription_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger subscriptions_stamp_status_change
  before update on public.subscriptions
  for each row execute function private.stamp_subscription_status_change();

-- One row per calendar month, upserted daily by the billing-lifecycle cron,
-- so the current month's row tracks today's MRR and past months freeze at
-- their last value. created_at (never touched by the upsert) doubles as
-- "since when have we been tracking", which admin_metrics() uses to know
-- whether a full 90-day churn window exists yet.
create table public.mrr_snapshots (
  month date primary key,
  mrr_egp numeric not null,
  active_count int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mrr_snapshots enable row level security;

create policy admin_read on public.mrr_snapshots for select to authenticated
  using ((select private.is_admin()));

grant select on public.mrr_snapshots to authenticated;
grant select, insert, update, delete on public.mrr_snapshots to service_role;

create function public.snapshot_mrr()
returns void
language sql
set search_path = ''
as $$
  insert into public.mrr_snapshots (month, mrr_egp, active_count)
  select date_trunc('month', now())::date, coalesce(sum(t.price_egp_monthly), 0), count(*)
  from public.subscriptions s
  join public.subscription_tiers t on t.id = s.tier_id
  where s.status = 'active'
  on conflict (month) do update
    set mrr_egp = excluded.mrr_egp,
        active_count = excluded.active_count,
        updated_at = now();
$$;

-- Cron only. anon/authenticated are revoked by name because Supabase's
-- default privileges grant execute on new public functions to them directly,
-- not just through PUBLIC.
revoke execute on function public.snapshot_mrr() from public, anon, authenticated;
grant execute on function public.snapshot_mrr() to service_role;

-- Everything aggregate on the admin home in one call. Existing keys keep
-- their meaning (churn_rate is still the all-time ratio); the rest is new.
create or replace function public.admin_metrics()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result json;
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  with totals as (
    select
      coalesce(sum(t.price_egp_monthly) filter (where s.status = 'active'), 0) as mrr,
      coalesce(sum(t.price_egp_monthly) filter (where s.status = 'past_due'), 0) as past_due_amount,
      count(*) filter (where s.status = 'active') as active,
      count(*) filter (where s.status = 'trialing') as trialing,
      count(*) filter (where s.status = 'past_due') as past_due,
      count(*) filter (where s.status = 'canceled') as canceled,
      count(*) filter (
        where s.status = 'canceled' and s.status_changed_at >= now() - interval '90 days'
      ) as canceled_90d
    from public.subscriptions s
    join public.subscription_tiers t on t.id = s.tier_id
  )
  select json_build_object(
    'mrr_egp', totals.mrr,
    'active_count', totals.active,
    'trialing_count', totals.trialing,
    'past_due_count', totals.past_due,
    'canceled_count', totals.canceled,
    'churn_rate',
      case when (totals.active + totals.past_due + totals.canceled) = 0 then 0
      else round(totals.canceled::numeric / (totals.active + totals.past_due + totals.canceled), 4)
      end,
    -- List price of every past_due subscription: what is expected, not an
    -- invoiced amount (platform billing has no invoices).
    'past_due_amount_egp', totals.past_due_amount,
    'canceled_90d_count', totals.canceled_90d,
    -- False until status changes have been stamped for a full 90 days;
    -- before that canceled_90d_count can undercount.
    'churn_window_complete', coalesce(
      (select min(m.created_at) <= now() - interval '90 days' from public.mrr_snapshots m),
      false
    ),
    -- Paying coaches per tier, same "active only" definition as mrr_egp.
    'plan_mix', (
      select coalesce(
        json_agg(json_build_object('key', x.key, 'count', x.n, 'mrr_egp', x.mrr) order by x.price),
        '[]'::json
      )
      from (
        select t.key, t.price_egp_monthly as price,
               count(s.id) as n,
               count(s.id) * t.price_egp_monthly as mrr
        from public.subscription_tiers t
        left join public.subscriptions s on s.tier_id = t.id and s.status = 'active'
        group by t.id
      ) x
    ),
    'mrr_history', (
      select coalesce(json_agg(json_build_object('month', h.month, 'mrr_egp', h.mrr_egp) order by h.month), '[]'::json)
      from (
        select m.month, m.mrr_egp from public.mrr_snapshots m order by m.month desc limit 12
      ) h
    ),
    -- Same 5-minute window as list_online_users().
    'online_count', (
      select count(*) from public.profiles p
      where p.role <> 'admin' and p.last_seen_at >= now() - interval '5 minutes'
    )
  )
  into v_result
  from totals;

  return v_result;
end;
$$;

-- Return type is changing, so drop and recreate (see 20260806000001). New
-- columns are appended; existing ones are unchanged.
drop function if exists public.admin_list_coaches();

create function public.admin_list_coaches()
returns table (
  coach_id uuid,
  business_name text,
  phone text,
  tier_key text,
  status text,
  mrr_egp numeric,
  client_count bigint,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz,
  owner_name text,
  price_egp_monthly numeric,
  last_seen_at timestamptz,
  status_changed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  return query
    select
      c.id,
      c.business_name,
      p.phone,
      t.key,
      s.status,
      case when s.status = 'active' then coalesce(t.price_egp_monthly, 0) else 0 end,
      (select count(*) from public.clients cl where cl.coach_id = c.id and cl.status <> 'archived'),
      s.current_period_end,
      s.trial_ends_at,
      c.created_at,
      p.full_name,
      t.price_egp_monthly,
      p.last_seen_at,
      s.status_changed_at
    from public.coaches c
    join public.profiles p on p.id = c.id
    left join public.subscriptions s on s.coach_id = c.id
    left join public.subscription_tiers t on t.id = s.tier_id
    order by c.created_at desc;
end;
$$;

revoke execute on function public.admin_list_coaches() from public;
grant execute on function public.admin_list_coaches() to authenticated;
