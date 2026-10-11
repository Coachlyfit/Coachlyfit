-- Subscription management: a coach can ask for a plan change, cancel at the
-- end of the period and resume; an admin can set plan/status/end date,
-- resolve requests and leave internal notes.
--
-- Billing is still manual, so nothing here charges anyone. The rule from
-- 20260731000010_billing.sql is kept: public.subscriptions gets no write
-- policy and no write grant. Every write is a security definer function that
-- checks the caller itself, so a coach still can't grant themself a plan or a
-- longer period.

alter table public.subscriptions
  add column cancel_at_period_end boolean not null default false;

-- Coaches created before subscription_tiers was seeded (20260820000001) got
-- no row at all: start_trial_subscription() skips when no tier exists. Same
-- tier pick and trial length as that trigger.
insert into public.subscriptions (coach_id, tier_id, status, trial_ends_at, current_period_end)
select c.id, t.id, 'trialing', now() + d.days * interval '1 day', now() + d.days * interval '1 day'
from public.coaches c
cross join lateral (
  select id from public.subscription_tiers where is_active order by price_egp_monthly asc limit 1
) t
cross join (
  select coalesce(
    (select (value ->> 'trial_days')::int from public.platform_settings where key = 'billing'),
    14
  ) as days
) d
where not exists (select 1 from public.subscriptions s where s.coach_id = c.id);

create table public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  type text not null check (type in ('change_plan', 'reactivate', 'other')),
  tier_id uuid references public.subscription_tiers (id),
  note text check (char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- Shown to the coach. Internal notes go to admin_audit_log instead.
  admin_response text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint subscription_requests_tier_matches_type check ((type = 'change_plan') = (tier_id is not null))
);

-- One open request per coach: keeps the admin inbox to what is actionable.
create unique index subscription_requests_one_pending_idx
  on public.subscription_requests (coach_id) where status = 'pending';
create index subscription_requests_status_idx
  on public.subscription_requests (status, created_at desc);

alter table public.subscription_requests enable row level security;

-- Team members can see the tenant's requests; only the owner can file or
-- withdraw one (coaches.id is the owner's own user id).
create policy coach_read on public.subscription_requests for select to authenticated
  using (coach_id = (select private.coach_id()));
create policy owner_insert on public.subscription_requests for insert to authenticated
  with check (coach_id = (select auth.uid()));
create policy owner_withdraw on public.subscription_requests for delete to authenticated
  using (coach_id = (select auth.uid()) and status = 'pending');
create policy admin_read on public.subscription_requests for select to authenticated
  using ((select private.is_admin()));

-- No update policy or grant: a request is resolved only through
-- admin_resolve_subscription_request(). Insert is granted per column so
-- status / admin_response / resolved_* can't be supplied by the coach.
revoke all on public.subscription_requests from anon, authenticated;
grant select, delete on public.subscription_requests to authenticated;
grant insert (coach_id, type, tier_id, note) on public.subscription_requests to authenticated;
grant select, insert, update, delete on public.subscription_requests to service_role;

-- Coach self-service: the flag only. Status, plan and dates stay admin/cron
-- territory. The daily lifecycle route cancels at the deadline when it is set.
create function public.set_my_subscription_cancel(p_cancel boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.subscriptions
  set cancel_at_period_end = coalesce(p_cancel, false)
  where coach_id = (select auth.uid()) and status <> 'canceled';

  if not found then
    raise exception 'No subscription to cancel or resume.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.set_my_subscription_cancel(boolean) from public, anon;
grant execute on function public.set_my_subscription_cancel(boolean) to authenticated;

alter table public.admin_audit_log drop constraint admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check check (action in (
  'profile_update', 'email_change', 'password_reset',
  'role_change', 'suspend', 'unsuspend', 'delete',
  'invite_link_created',
  'subscription_update', 'note', 'request_approve', 'request_reject'
));

-- Null parameter = leave that field alone. Creates the row when the coach has
-- none (then a plan is required). Logs only what actually changed.
create function public.admin_update_subscription(
  p_coach_id uuid,
  p_tier_id uuid default null,
  p_status text default null,
  p_period_end timestamptz default null,
  p_cancel_at_period_end boolean default null
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
      coach_id, tier_id, status, trial_ends_at, current_period_end, cancel_at_period_end
    )
    values (
      p_coach_id, p_tier_id, coalesce(p_status, 'active'),
      case when p_status = 'trialing' then p_period_end end,
      p_period_end, coalesce(p_cancel_at_period_end, false)
    )
    returning * into v_new;
  else
    update public.subscriptions
    set tier_id = coalesce(p_tier_id, tier_id),
        status = coalesce(p_status, status),
        current_period_end = coalesce(p_period_end, current_period_end),
        -- The lifecycle route measures a trial against trial_ends_at.
        trial_ends_at = case
          when coalesce(p_status, status) = 'trialing' and p_period_end is not null then p_period_end
          else trial_ends_at
        end,
        cancel_at_period_end = case
          when coalesce(p_status, status) = 'canceled' then false
          else coalesce(p_cancel_at_period_end, cancel_at_period_end)
        end
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

  if v_details <> '{}'::jsonb then
    perform private.log_admin_action(p_coach_id, 'subscription_update', v_details);
  end if;
end;
$$;

revoke execute on function public.admin_update_subscription(uuid, uuid, text, timestamptz, boolean) from public, anon;
grant execute on function public.admin_update_subscription(uuid, uuid, text, timestamptz, boolean) to authenticated;

-- Approving a change_plan request switches the plan right away. The other
-- types carry no change to apply: the admin acts with record_payment() /
-- admin_update_subscription() and approves to close the request.
create function public.admin_resolve_subscription_request(
  p_request_id uuid,
  p_approve boolean,
  p_response text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.subscription_requests;
  v_old_tier uuid;
  v_details jsonb;
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  select * into v_req from public.subscription_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Request already resolved.' using errcode = '22023';
  end if;

  v_details := jsonb_build_object('request_type', v_req.type);

  if p_approve and v_req.type = 'change_plan' then
    select tier_id into v_old_tier from public.subscriptions where coach_id = v_req.coach_id for update;
    if not found then
      raise exception 'No subscription found for that coach.' using errcode = 'P0002';
    end if;

    update public.subscriptions set tier_id = v_req.tier_id where coach_id = v_req.coach_id;

    v_details := v_details || jsonb_build_object('tier', jsonb_build_object(
      'from', (select key from public.subscription_tiers where id = v_old_tier),
      'to', (select key from public.subscription_tiers where id = v_req.tier_id)
    ));
  end if;

  update public.subscription_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      admin_response = nullif(btrim(p_response), ''),
      resolved_by = (select auth.uid()),
      resolved_at = now()
  where id = p_request_id;

  perform private.log_admin_action(
    v_req.coach_id,
    case when p_approve then 'request_approve' else 'request_reject' end,
    v_details
  );
end;
$$;

revoke execute on function public.admin_resolve_subscription_request(uuid, boolean, text) from public, anon;
grant execute on function public.admin_resolve_subscription_request(uuid, boolean, text) to authenticated;

-- Internal note about a coach. Lives in the audit log (admin-read-only, and
-- it records who and when for free); a column on subscriptions would be
-- readable by the coach.
create function public.admin_add_coach_note(p_coach_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;
  if v_note = '' or char_length(v_note) > 1000 then
    raise exception 'Invalid note.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.coaches where id = p_coach_id) then
    raise exception 'Coach not found.' using errcode = 'P0002';
  end if;

  perform private.log_admin_action(p_coach_id, 'note', jsonb_build_object('note', v_note));
end;
$$;

revoke execute on function public.admin_add_coach_note(uuid, text) from public, anon;
grant execute on function public.admin_add_coach_note(uuid, text) to authenticated;

-- Unchanged from 20260731000010_billing.sql except the last update: a
-- recorded payment is a renewal, so it clears a pending cancellation.
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
  set status = 'active', current_period_end = p_period_end, cancel_at_period_end = false
  where id = v_subscription_id;

  return v_payment_id;
end;
$$;

-- Return type is changing, so drop and recreate (see 20261011000002). New
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
  status_changed_at timestamptz,
  tier_id uuid,
  cancel_at_period_end boolean,
  suspended_at timestamptz
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
      s.status_changed_at,
      s.tier_id,
      coalesce(s.cancel_at_period_end, false),
      p.suspended_at
    from public.coaches c
    join public.profiles p on p.id = c.id
    left join public.subscriptions s on s.coach_id = c.id
    left join public.subscription_tiers t on t.id = s.tier_id
    order by c.created_at desc;
end;
$$;

revoke execute on function public.admin_list_coaches() from public, anon;
grant execute on function public.admin_list_coaches() to authenticated;
