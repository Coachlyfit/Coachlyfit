-- Team seats were unlimited on every plan, and any accepted member could
-- invite or remove other members. This adds a per-plan cap (data, edited from
-- the admin Plans grid), the task_management plan flag the tasks module gates
-- on, and makes managing the team owner-only.

-- null = no cap, same as max_clients (20261015000001). 0 is valid here, unlike
-- max_clients: a plan can include no team seats at all.
alter table public.subscription_tiers add column max_team_members int;

alter table public.subscription_tiers
  add constraint subscription_tiers_max_team_members_nonneg
  check (max_team_members is null or max_team_members >= 0);

update public.subscription_tiers
set max_team_members = case key when 'starter' then 0 when 'pro' then 3 else null end,
    features = features || jsonb_build_object('task_management', key in ('pro', 'elite'));

-- Same function as 20261015000001 plus max_team_members. A payload without
-- the key writes null (no cap), so the app and this migration ship together.
create or replace function public.admin_update_tiers(p_tiers jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  update public.subscription_tiers t
  set name_ar = x.name_ar,
      name_en = x.name_en,
      price_egp_monthly = x.price_egp_monthly,
      max_clients = x.max_clients,
      max_team_members = x.max_team_members,
      is_active = x.is_active,
      features = x.features
  from jsonb_to_recordset(p_tiers) as x(
    id uuid,
    name_ar text,
    name_en text,
    price_egp_monthly numeric,
    max_clients int,
    max_team_members int,
    is_active boolean,
    features jsonb
  )
  where t.id = x.id;

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_tiers) then
    raise exception 'Unknown plan.' using errcode = 'P0002';
  end if;
end;
$$;

-- A seat is an accepted member or an invite that can still be accepted. An
-- expired invite frees its seat without anyone deleting the row. The owner is
-- not a team_members row, so is never counted.
create function private.team_seats_used(p_coach_id uuid)
returns int
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)::int
  from public.team_members
  where coach_id = p_coach_id
    and (accepted_at is not null or expires_at > now());
$$;

revoke execute on function private.team_seats_used(uuid) from public;

-- Modelled on private.enforce_client_cap() (20261017000002). team_members is
-- outside the coach_access_* policies, so the subscription check lives here.
-- Insert only: rows that already exist are never touched, which is the whole
-- of the downgrade rule -- a team over its new cap keeps everyone and just
-- can't add more.
create function private.enforce_team_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
begin
  if not private.coach_has_access(new.coach_id) then
    raise exception 'An active subscription is required to invite team members.'
      using errcode = 'P0001', hint = 'subscription_inactive';
  end if;

  -- Locks the subscription row so two invites sent at once can't both read
  -- the same count and both fit under the cap.
  select t.max_team_members into v_max
  from public.subscriptions s
  join public.subscription_tiers t on t.id = s.tier_id
  where s.coach_id = new.coach_id
  for update of s;

  if v_max is null then
    return new;
  end if;

  if private.team_seats_used(new.coach_id) >= v_max then
    raise exception 'Team member limit reached for your current plan.'
      using errcode = '23514', hint = 'team_limit_reached';
  end if;

  return new;
end;
$$;

create trigger team_members_enforce_cap
  before insert on public.team_members
  for each row execute function private.enforce_team_cap();

-- Same function as 20260824000002 plus the cap check: an invite sent before a
-- downgrade must not be redeemable into a team that is now full. Counts
-- accepted members only -- the invite being redeemed is itself a pending seat.
create or replace function public.accept_team_invite(p_token text, p_ip inet default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.team_members%rowtype;
  v_attempts int;
  v_role public.user_role;
  v_max int;
begin
  if p_ip is not null then
    insert into public.invite_attempts (ip, attempts, window_started_at)
    values (p_ip, 1, now())
    on conflict (ip) do update set
      attempts = case
        when public.invite_attempts.window_started_at < now() - interval '1 hour'
          then 1
        else public.invite_attempts.attempts + 1
      end,
      window_started_at = case
        when public.invite_attempts.window_started_at < now() - interval '1 hour'
          then now()
        else public.invite_attempts.window_started_at
      end
    returning attempts into v_attempts;

    if v_attempts > 20 then
      raise exception 'Too many attempts. Try again later.' using errcode = '42901';
    end if;
  end if;

  select role into v_role from public.profiles where id = (select auth.uid());
  if v_role is distinct from 'coach' then
    raise exception 'Only coach accounts can accept a team invite.' using errcode = 'P0002';
  end if;

  select * into v_row
  from public.team_members
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if v_row.id is null then
    raise exception 'Invalid or expired invite.' using errcode = 'P0002';
  end if;
  if v_row.accepted_at is not null then
    raise exception 'This invite has already been used.' using errcode = 'P0002';
  end if;
  if v_row.expires_at < now() then
    raise exception 'This invite has expired.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.coaches where id = (select auth.uid())) then
    raise exception 'This account already owns a coaching business.' using errcode = 'P0002';
  end if;

  select t.max_team_members into v_max
  from public.subscriptions s
  join public.subscription_tiers t on t.id = s.tier_id
  where s.coach_id = v_row.coach_id
  for update of s;

  if v_max is not null and (
    select count(*) from public.team_members
    where coach_id = v_row.coach_id and accepted_at is not null
  ) >= v_max then
    raise exception 'This team is full.' using errcode = 'P0002', hint = 'team_limit_reached';
  end if;

  update public.team_members
  set profile_id = (select auth.uid()), accepted_at = now()
  where id = v_row.id and accepted_at is null;

  if not found then
    raise exception 'This invite has already been used.' using errcode = 'P0002';
  end if;

  return json_build_object('coach_id', v_row.coach_id);
end;
$$;

-- The caller's tenant's seat numbers for the team card. Security definer so
-- the count rule lives in one place (private.team_seats_used) and the cap is
-- readable even when the tier is paused (public_read hides inactive tiers).
-- max_members null = no cap.
create function public.get_my_team_seats()
returns table (max_members int, used int, accepted int)
language sql
security definer
stable
set search_path = ''
as $$
  select
    (
      select t.max_team_members
      from public.subscriptions s
      join public.subscription_tiers t on t.id = s.tier_id
      where s.coach_id = c.id
    ),
    private.team_seats_used(c.id),
    (
      select count(*)::int from public.team_members tm
      where tm.coach_id = c.id and tm.accepted_at is not null
    )
  from (select private.coach_id() as id) c
  where c.id is not null;
$$;

revoke execute on function public.get_my_team_seats() from public, anon;
grant execute on function public.get_my_team_seats() to authenticated;

-- coach_rw let any accepted member invite and remove members, since
-- private.coach_id() resolves for them too. Members keep reading the list;
-- only the owner (coaches.id = their own auth.uid(), the same test
-- subscription_requests uses in 20261012000001) changes it. Nothing updates a
-- row through RLS: acceptance goes through accept_team_invite().
drop policy coach_rw on public.team_members;

create policy team_read on public.team_members
  for select to authenticated
  using (coach_id = (select private.coach_id()));

create policy owner_insert on public.team_members
  for insert to authenticated
  with check (coach_id = (select auth.uid()));

create policy owner_delete on public.team_members
  for delete to authenticated
  using (coach_id = (select auth.uid()));

revoke update on public.team_members from authenticated;
