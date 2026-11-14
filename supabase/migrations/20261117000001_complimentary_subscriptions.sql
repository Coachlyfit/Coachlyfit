-- Free-access (complimentary) coaches, e.g. marketing accounts. They keep
-- status = 'active' so access, client caps and the lifecycle cron behave as
-- before, but they are not revenue: every money figure (MRR, snapshots,
-- plan mix, past-due amount, active-paying count) now excludes them. Before
-- this, revenue was "active x current list price", so four comped Elite
-- accounts read as 63,996 EGP/month with zero payments recorded.

alter table public.subscriptions
  add column is_complimentary boolean not null default false;

-- Active with no recorded payment = never paid = free access.
update public.subscriptions s
set is_complimentary = true
where s.status = 'active'
  and not exists (select 1 from public.payments p where p.subscription_id = s.id);

-- Same as 20261011000002 plus `not s.is_complimentary` on the paying figures.
create or replace function public.snapshot_mrr()
returns void
language sql
set search_path = ''
as $$
  insert into public.mrr_snapshots (month, mrr_egp, active_count)
  select date_trunc('month', now())::date, coalesce(sum(t.price_egp_monthly), 0), count(*)
  from public.subscriptions s
  join public.subscription_tiers t on t.id = s.tier_id
  where s.status = 'active' and not s.is_complimentary
  on conflict (month) do update
    set mrr_egp = excluded.mrr_egp,
        active_count = excluded.active_count,
        updated_at = now();
$$;

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
      coalesce(sum(t.price_egp_monthly) filter (where s.status = 'active' and not s.is_complimentary), 0) as mrr,
      coalesce(sum(t.price_egp_monthly) filter (where s.status = 'past_due' and not s.is_complimentary), 0) as past_due_amount,
      count(*) filter (where s.status = 'active' and not s.is_complimentary) as active,
      count(*) filter (where s.status = 'active' and s.is_complimentary) as complimentary,
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
    'complimentary_count', totals.complimentary,
    'trialing_count', totals.trialing,
    'past_due_count', totals.past_due,
    'canceled_count', totals.canceled,
    'churn_rate',
      case when (totals.active + totals.past_due + totals.canceled) = 0 then 0
      else round(totals.canceled::numeric / (totals.active + totals.past_due + totals.canceled), 4)
      end,
    'past_due_amount_egp', totals.past_due_amount,
    'canceled_90d_count', totals.canceled_90d,
    'churn_window_complete', coalesce(
      (select min(m.created_at) <= now() - interval '90 days' from public.mrr_snapshots m),
      false
    ),
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
        left join public.subscriptions s
          on s.tier_id = t.id and s.status = 'active' and not s.is_complimentary
        group by t.id
      ) x
    ),
    'mrr_history', (
      select coalesce(json_agg(json_build_object('month', h.month, 'mrr_egp', h.mrr_egp) order by h.month), '[]'::json)
      from (
        select m.month, m.mrr_egp from public.mrr_snapshots m order by m.month desc limit 12
      ) h
    ),
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

-- Return type changes: drop and recreate (see 20261012000001). Column added
-- at the end; mrr_egp is 0 for a comped coach.
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
  status_changed_at timestamptz,
  tier_id uuid,
  cancel_at_period_end boolean,
  suspended_at timestamptz,
  is_complimentary boolean
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
      case when s.status = 'active' and not s.is_complimentary then coalesce(t.price_egp_monthly, 0) else 0 end,
      (select count(*) from public.clients cl where cl.coach_id = c.id and cl.status <> 'archived'),
      s.current_period_end,
      s.trial_ends_at,
      c.created_at,
      p.full_name,
      t.price_egp_monthly,
      p.last_seen_at,
      s.status_changed_at,
      s.tier_id,
      coalesce(s.cancel_at_period_end, false),
      p.suspended_at,
      coalesce(s.is_complimentary, false)
    from public.coaches c
    join public.profiles p on p.id = c.id
    left join public.subscriptions s on s.coach_id = c.id
    left join public.subscription_tiers t on t.id = s.tier_id
    order by c.created_at desc;
end;
$$;

revoke execute on function public.admin_list_coaches() from public, anon;
grant execute on function public.admin_list_coaches() to authenticated;

-- A recorded payment means the coach is paying: clears the free-access flag.
-- Otherwise identical to 20261012000001.
create or replace function public.record_payment(
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
  set status = 'active', current_period_end = p_period_end,
      cancel_at_period_end = false, is_complimentary = false
  where id = v_subscription_id;

  return v_payment_id;
end;
$$;

-- New optional parameter changes the signature: drop the old one.
drop function public.admin_update_subscription(uuid, uuid, text, timestamptz, boolean);

create function public.admin_update_subscription(
  p_coach_id uuid,
  p_tier_id uuid default null,
  p_status text default null,
  p_period_end timestamptz default null,
  p_cancel_at_period_end boolean default null,
  p_complimentary boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.subscriptions;
  v_new public.subscriptions;
  v_details jsonb := '{}'::jsonb;
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.coaches where id = p_coach_id) then
    raise exception 'Coach not found.' using errcode = 'P0002';
  end if;

  select * into v_old from public.subscriptions where coach_id = p_coach_id for update;

  if not found then
    if p_tier_id is null then
      raise exception 'A plan is required to create a subscription.' using errcode = '22023';
    end if;
    insert into public.subscriptions (
      coach_id, tier_id, status, trial_ends_at, current_period_end, cancel_at_period_end, is_complimentary
    )
    values (
      p_coach_id, p_tier_id, coalesce(p_status, 'active'),
      case when p_status = 'trialing' then p_period_end end,
      p_period_end, coalesce(p_cancel_at_period_end, false), coalesce(p_complimentary, false)
    )
    returning * into v_new;
  else
    update public.subscriptions
    set tier_id = coalesce(p_tier_id, tier_id),
        status = coalesce(p_status, status),
        current_period_end = coalesce(p_period_end, current_period_end),
        trial_ends_at = case
          when coalesce(p_status, status) = 'trialing' and p_period_end is not null then p_period_end
          else trial_ends_at
        end,
        cancel_at_period_end = case
          when coalesce(p_status, status) = 'canceled' then false
          else coalesce(p_cancel_at_period_end, cancel_at_period_end)
        end,
        is_complimentary = coalesce(p_complimentary, is_complimentary)
    where id = v_old.id
    returning * into v_new;
  end if;

  if v_old.tier_id is distinct from v_new.tier_id then
    v_details := v_details || jsonb_build_object('tier', jsonb_build_object(
      'from', (select key from public.subscription_tiers where id = v_old.tier_id),
      'to', (select key from public.subscription_tiers where id = v_new.tier_id)
    ));
  end if;
  if v_old.status is distinct from v_new.status then
    v_details := v_details || jsonb_build_object('status', jsonb_build_object('from', v_old.status, 'to', v_new.status));
  end if;
  if v_old.current_period_end is distinct from v_new.current_period_end then
    v_details := v_details || jsonb_build_object('period_end', jsonb_build_object(
      'from', to_char(v_old.current_period_end at time zone 'UTC', 'YYYY-MM-DD'),
      'to', to_char(v_new.current_period_end at time zone 'UTC', 'YYYY-MM-DD')
    ));
  end if;
  if v_old.cancel_at_period_end is distinct from v_new.cancel_at_period_end then
    v_details := v_details || jsonb_build_object('cancel_at_period_end', jsonb_build_object(
      'from', v_old.cancel_at_period_end, 'to', v_new.cancel_at_period_end
    ));
  end if;
  if v_old.is_complimentary is distinct from v_new.is_complimentary then
    v_details := v_details || jsonb_build_object('complimentary', jsonb_build_object(
      'from', v_old.is_complimentary, 'to', v_new.is_complimentary
    ));
  end if;

  if v_details <> '{}'::jsonb then
    perform private.log_admin_action(p_coach_id, 'subscription_update', v_details);
  end if;
end;
$$;

revoke execute on function public.admin_update_subscription(uuid, uuid, text, timestamptz, boolean, boolean) from public, anon;
grant execute on function public.admin_update_subscription(uuid, uuid, text, timestamptz, boolean, boolean) to authenticated;
