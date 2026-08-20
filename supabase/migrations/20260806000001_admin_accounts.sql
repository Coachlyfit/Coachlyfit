-- Adds phone (for the admin accounts search box) and a per-coach MRR figure
-- (the accounts list needs it per-row, not just the platform-wide total
-- admin_metrics() already returns) to admin_list_coaches(). Return type is
-- changing, so this must drop and recreate rather than create-or-replace.
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
      p.phone,
      t.key,
      s.status,
      case when s.status = 'active' then coalesce(t.price_egp_monthly, 0) else 0 end,
      (select count(*) from public.clients cl where cl.coach_id = c.id and cl.status <> 'archived'),
      s.current_period_end,
      s.trial_ends_at,
      c.created_at
    from public.coaches c
    join public.profiles p on p.id = c.id
    left join public.subscriptions s on s.coach_id = c.id
    left join public.subscription_tiers t on t.id = s.tier_id
    order by c.created_at desc;
end;
$$;

revoke execute on function public.admin_list_coaches() from public;
grant execute on function public.admin_list_coaches() to authenticated;
