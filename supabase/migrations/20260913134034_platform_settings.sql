-- Platform-wide admin-controlled settings (branding, toggles, announcement,
-- trial length) plus user suspend/role-change support. Key/value jsonb
-- table rather than typed columns: settings grow over time and each new
-- one shouldn't need a migration -- src/domain/platform validates shape
-- app-side with zod. Read is open (anon+authenticated) because marketing
-- and the signup page need maintenance_mode/signups_enabled before login.

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.platform_settings enable row level security;

create policy settings_read on public.platform_settings
  for select to anon, authenticated
  using (true);

create policy settings_admin_write on public.platform_settings
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

insert into public.platform_settings (key, value) values
  ('platform', '{"maintenance_mode": false, "signups_enabled": true}'::jsonb),
  ('branding', '{"app_name_ar": "كوتشلي فِت", "app_name_en": "Coachlyfit", "support_email": "hello@coachlyfit.com"}'::jsonb),
  ('announcement', '{"enabled": false, "text_ar": "", "text_en": ""}'::jsonb),
  ('billing', '{"trial_days": 14}'::jsonb);

-- Suspend without deleting the account -- coach/client layouts bounce to
-- /suspended when set. Nullable = not suspended, matches the
-- onboarding_completed_at/deleted_at null-means-active convention used
-- elsewhere in this schema.
alter table public.profiles add column suspended_at timestamptz;

-- start_trial_subscription() now reads billing.trial_days instead of the
-- hardcoded 14 -- create-or-replace, same trigger, no migration needed for
-- the trigger itself.
create or replace function private.start_trial_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier_id uuid;
  v_trial_days int;
begin
  select id into v_tier_id
  from public.subscription_tiers
  where is_active
  order by price_egp_monthly asc
  limit 1;

  select coalesce((value->>'trial_days')::int, 14) into v_trial_days
  from public.platform_settings
  where key = 'billing';

  if v_tier_id is not null then
    insert into public.subscriptions (coach_id, tier_id, status, trial_ends_at, current_period_end)
    values (new.id, v_tier_id, 'trialing', now() + (v_trial_days * interval '1 day'), now() + (v_trial_days * interval '1 day'));
  end if;

  return new;
end;
$$;

-- Role/suspend mutation RPCs, same admin-guard shape as admin_list_coaches.
-- Both refuse to act on the calling admin's own row -- an admin locking
-- themselves out (demote or self-suspend) has no recovery path short of a
-- direct DB edit, so it's blocked at the function level.
create function public.admin_set_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'Cannot change your own role.' using errcode = '42501';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

create function public.admin_set_suspended(p_user_id uuid, p_suspended boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'Cannot suspend your own account.' using errcode = '42501';
  end if;

  update public.profiles
  set suspended_at = case when p_suspended then now() else null end
  where id = p_user_id;
end;
$$;

-- Generic cross-role user list for the admin Users tab (admin_list_coaches
-- stays coach-specific with its MRR/tier columns -- this is role-agnostic).
create function public.admin_list_users()
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  role public.user_role,
  suspended_at timestamptz,
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
    select p.id, p.full_name, u.email, p.phone, p.role, p.suspended_at, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

revoke execute on function public.admin_set_role(uuid, public.user_role) from public;
revoke execute on function public.admin_set_suspended(uuid, boolean) from public;
revoke execute on function public.admin_list_users() from public;
grant execute on function public.admin_set_role(uuid, public.user_role) to authenticated;
grant execute on function public.admin_set_suspended(uuid, boolean) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
