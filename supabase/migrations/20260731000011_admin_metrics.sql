-- Cross-coach visibility for the admin dashboard. These are the ONLY way
-- admin sees anything beyond coaches/subscriptions/subscription_tiers/
-- payments — there is deliberately no broad admin RLS policy on
-- client-owned tables (clients, checkins, body_metrics, form_submissions,
-- media, ...), so the platform owner sees revenue and churn, never a
-- client's body measurements or photos.
create function public.admin_list_coaches()
returns table (
  coach_id uuid,
  business_name text,
  tier_key text,
  status text,
  client_count bigint,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz
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
      t.key,
      s.status,
      (select count(*) from public.clients cl where cl.coach_id = c.id and cl.status <> 'archived'),
      s.current_period_end,
      s.trial_ends_at,
      c.created_at
    from public.coaches c
    left join public.subscriptions s on s.coach_id = c.id
    left join public.subscription_tiers t on t.id = s.tier_id
    order by c.created_at desc;
end;
$$;

revoke execute on function public.admin_list_coaches() from public;
grant execute on function public.admin_list_coaches() to authenticated;

create function public.admin_metrics()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mrr numeric;
  v_active int;
  v_trialing int;
  v_past_due int;
  v_canceled int;
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  select coalesce(sum(t.price_egp_monthly), 0) into v_mrr
  from public.subscriptions s
  join public.subscription_tiers t on t.id = s.tier_id
  where s.status = 'active';

  select count(*) filter (where status = 'active'),
         count(*) filter (where status = 'trialing'),
         count(*) filter (where status = 'past_due'),
         count(*) filter (where status = 'canceled')
  into v_active, v_trialing, v_past_due, v_canceled
  from public.subscriptions;

  return json_build_object(
    'mrr_egp', v_mrr,
    'active_count', v_active,
    'trialing_count', v_trialing,
    'past_due_count', v_past_due,
    'canceled_count', v_canceled,
    'churn_rate',
      case when (v_active + v_past_due + v_canceled) = 0 then 0
      else round(v_canceled::numeric / (v_active + v_past_due + v_canceled), 4)
      end
  );
end;
$$;

revoke execute on function public.admin_metrics() from public;
grant execute on function public.admin_metrics() to authenticated;
