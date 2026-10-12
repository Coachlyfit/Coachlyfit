-- A coach whose platform subscription has lapsed ('canceled', or no row at
-- all) kept full write access: the (coach) layout had no subscription check
-- and no policy looked at subscriptions.status. The layout now redirects
-- (UX); this is the boundary behind it.

-- Whether a coach's subscription still grants access. Same status set as
-- private.coach_has_feature (20261011000001): past_due is the grace window
-- the billing cron gives before it cancels.
create function private.coach_has_access(p_coach_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.coach_id = p_coach_id
      and s.status in ('trialing', 'active', 'past_due')
  );
$$;

revoke execute on function private.coach_has_access(uuid) from public;
grant execute on function private.coach_has_access(uuid) to authenticated;

-- Restrictive, so they AND with every existing permissive policy instead of
-- replacing it. Insert/update only: reads and deletes are untouched, so a
-- lapsed coach can still see (and clean up) their data, and their clients
-- keep reading what was assigned to them.
--
-- The check is on the caller, not the row: it only binds someone acting as
-- a coach or team member (private.coach_id() is not null). Clients, admins
-- and security definer functions are unaffected. An admin impersonating a
-- lapsed coach holds that coach's session, so they can look but not write.
--
-- Not guarded on purpose: subscription_requests (asking to reactivate has to
-- work), coaches (settings), messages, check-in reviews, team_members.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'invites',
    'programs', 'program_days', 'program_items', 'program_item_sets', 'program_activities',
    'diet_plans', 'meals', 'meal_items', 'rehab_protocols', 'rehab_phases',
    'form_templates', 'form_template_versions', 'form_assignments',
    'exercises', 'foods',
    'client_subscriptions', 'client_transactions', 'invoices'
  ]
  loop
    execute format(
      'create policy coach_access_insert on public.%I as restrictive for insert to authenticated
         with check ((select private.coach_id()) is null
                     or (select private.coach_has_access((select private.coach_id()))))', t
    );
    execute format(
      'create policy coach_access_update on public.%I as restrictive for update to authenticated
         with check ((select private.coach_id()) is null
                     or (select private.coach_has_access((select private.coach_id()))))', t
    );
  end loop;
end $$;

-- The seat cap only looked at max_clients, and let the insert through when
-- the coach had no subscription row. Now a lapsed or missing subscription
-- blocks first, so past this point a null max can only mean an unlimited
-- tier (20261015000001). Shared by the insert, restore and coach-change
-- triggers, which fire for every role.
create or replace function private.enforce_client_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
  v_count int;
begin
  if not private.coach_has_access(new.coach_id) then
    raise exception 'An active subscription is required to add clients.'
      using errcode = 'P0001', hint = 'subscription_inactive';
  end if;

  select t.max_clients into v_max
  from public.subscriptions s
  join public.subscription_tiers t on t.id = s.tier_id
  where s.coach_id = new.coach_id;

  if v_max is null then
    return new;
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
