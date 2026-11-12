-- Team invites were only linked in /auth/confirm, which never ran for the
-- default confirmation email (Supabase's /verify comes back with ?code=, the
-- route only handled token_hash), so invitees ended up as tenantless coaches.
--
-- Fix: link inside handle_new_user() like client invites already do, and put
-- the whole accept rule in one function (private.claim_team_invite) that both
-- the signup trigger and accept_team_invite() call. It also:
--   * checks the invited email matches the account's email;
--   * lets an account that owns a truly EMPTY workspace join (the workspace is
--     soft-archived in the same transaction); any data / paid plan -> refused.

-- ---------------------------------------------------------------------------
-- 1. Soft-archive support
-- ---------------------------------------------------------------------------
alter table public.coaches add column archived_at timestamptz;

-- coaches has a table-level UPDATE grant, so a column revoke wouldn't hold.
-- Only security-definer code (owner = postgres) may change archived_at, so a
-- user can neither un-archive themselves back into the old tenant nor archive
-- a live one.
create function private.guard_coach_archived()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived_at is distinct from old.archived_at
     and current_user in ('authenticated', 'anon') then
    raise exception 'archived_at is managed by the system.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger coaches_guard_archived
  before update on public.coaches
  for each row execute function private.guard_coach_archived();

-- Same as 20260824000002 plus `c.archived_at is null` on the owner branch: an
-- archived owner falls through to their team membership.
create or replace function private.coach_id()
returns uuid
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  return coalesce(
    (
      select p.id from public.profiles p
      join public.coaches c on c.id = p.id
      where p.id = (select auth.uid()) and p.role = 'coach' and c.archived_at is null
    ),
    (
      select tm.coach_id from public.team_members tm
      join public.profiles p on p.id = tm.profile_id
      where tm.profile_id = (select auth.uid())
        and tm.accepted_at is not null
        and p.role = 'coach'
    )
  );
end;
$$;

-- Owner-only policies compared coach_id to auth.uid() directly, which would
-- let an archived account keep writing into its dead tenant. Same shape as
-- support_tickets.owner_read: also require that the tenant resolves to self.
drop policy owner_insert on public.team_members;
create policy owner_insert on public.team_members
  for insert to authenticated
  with check (coach_id = (select auth.uid()) and (select private.coach_id()) = (select auth.uid()));

drop policy owner_delete on public.team_members;
create policy owner_delete on public.team_members
  for delete to authenticated
  using (coach_id = (select auth.uid()) and (select private.coach_id()) = (select auth.uid()));

drop policy owner_insert on public.subscription_requests;
create policy owner_insert on public.subscription_requests
  for insert to authenticated
  with check (coach_id = (select auth.uid()) and (select private.coach_id()) = (select auth.uid()));

drop policy owner_withdraw on public.subscription_requests;
create policy owner_withdraw on public.subscription_requests
  for delete to authenticated
  using (
    coach_id = (select auth.uid())
    and (select private.coach_id()) = (select auth.uid())
    and status = 'pending'
  );

drop policy owner_all on public.tasks;
create policy owner_all on public.tasks
  for all to authenticated
  using (
    coach_id = (select auth.uid())
    and (select private.coach_id()) = (select auth.uid())
    and (select private.coach_has_feature((select auth.uid()), 'task_management'))
  )
  with check (
    coach_id = (select auth.uid())
    and (select private.coach_id()) = (select auth.uid())
    and (select private.coach_has_feature((select auth.uid()), 'task_management'))
  );

-- ---------------------------------------------------------------------------
-- 2. "Truly empty" workspace test. Conservative on purpose: a false negative
-- only means a refusal, never data loss. Everything else (check-ins, logs,
-- program items, ...) hangs off clients / programs / diet_plans, so those
-- roots are enough. Trial-only (trialing, or a canceled trial) is fine; an
-- active / past_due subscription is not.
-- ---------------------------------------------------------------------------
create function private.team_workspace_is_empty(p_coach_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select not (
    exists (select 1 from public.clients where coach_id = p_coach_id)
    or exists (select 1 from public.programs where coach_id = p_coach_id)
    or exists (select 1 from public.form_templates where coach_id = p_coach_id)
    or exists (select 1 from public.messages where coach_id = p_coach_id)
    or exists (select 1 from public.diet_plans where coach_id = p_coach_id)
    or exists (select 1 from public.exercises where coach_id = p_coach_id)
    or exists (select 1 from public.foods where coach_id = p_coach_id)
    or exists (select 1 from public.recipes where coach_id = p_coach_id)
    or exists (select 1 from public.invoices where coach_id = p_coach_id)
    or exists (select 1 from public.payments where coach_id = p_coach_id)
    or exists (select 1 from public.tasks where coach_id = p_coach_id)
    or exists (select 1 from public.support_tickets where coach_id = p_coach_id)
    or exists (select 1 from public.team_members where coach_id = p_coach_id)
    or exists (
      select 1 from public.subscriptions
      where coach_id = p_coach_id and status in ('active', 'past_due')
    )
  );
$$;

revoke execute on function private.team_workspace_is_empty(uuid) from public;

-- ---------------------------------------------------------------------------
-- 3. The single accept rule. Callers: handle_new_user() (signup) and
-- accept_team_invite() (existing account). Any raise rolls the caller back,
-- including the archive below.
-- ---------------------------------------------------------------------------
create function private.claim_team_invite(p_profile_id uuid, p_email text, p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.team_members%rowtype;
  v_max int;
begin
  select * into v_row
  from public.team_members
  where token_hash = p_token_hash
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
  if p_email is null or lower(p_email) <> lower(v_row.email) then
    raise exception 'This invite was sent to a different email.'
      using errcode = 'P0002', hint = 'email_mismatch';
  end if;
  -- An owner redeeming an invite to their own team would archive their own
  -- workspace.
  if v_row.coach_id = p_profile_id then
    raise exception 'This account already owns a coaching business.'
      using errcode = 'P0002', hint = 'owns_business';
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

  if exists (select 1 from public.coaches where id = p_profile_id and archived_at is null) then
    if not private.team_workspace_is_empty(p_profile_id) then
      raise exception 'This account already owns a coaching business.'
        using errcode = 'P0002', hint = 'owns_business';
    end if;
    update public.coaches set archived_at = now() where id = p_profile_id;
    update public.subscriptions set status = 'canceled'
    where coach_id = p_profile_id and status = 'trialing';
  end if;

  update public.team_members
  set profile_id = p_profile_id, accepted_at = now()
  where id = v_row.id and accepted_at is null;

  if not found then
    raise exception 'This invite has already been used.' using errcode = 'P0002';
  end if;

  return v_row.coach_id;
end;
$$;

revoke execute on function private.claim_team_invite(uuid, text, text) from public;

-- Same rate limit + role guard as 20261020000001; the rest is delegated.
create or replace function public.accept_team_invite(p_token text, p_ip inet default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts int;
  v_role public.user_role;
  v_email text;
  v_coach_id uuid;
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

  select email into v_email from auth.users where id = (select auth.uid());

  v_coach_id := private.claim_team_invite(
    (select auth.uid()),
    v_email,
    encode(extensions.digest(p_token, 'sha256'), 'hex')
  );

  return json_build_object('coach_id', v_coach_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Signup trigger: 20261023000002's body plus the team-invite link. The
-- caller-supplied hash is only a lookup key; the coach is resolved from the
-- invite row. An invalid / mismatched / full invite raises, so the signup
-- rolls back and no orphan account is created. The legacy team_invite flag
-- (no hash) still just skips the coaches row.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := 'coach';
  v_invite public.invites;
  v_terms text;
  v_team_hash text;
begin
  if new.raw_user_meta_data ->> 'role' = 'client' then
    select * into v_invite
    from public.invites
    where token_hash = new.raw_user_meta_data ->> 'invite_token_hash'
      and accepted_at is null
      and expires_at > now();

    if v_invite.id is null then
      raise exception 'A client account needs a valid invite.' using errcode = 'P0002';
    end if;
    v_role := 'client';
  else
    v_team_hash := nullif(new.raw_user_meta_data ->> 'team_invite_token_hash', '');
  end if;

  v_terms := case
    when new.raw_user_meta_data ->> 'terms_version' ~ '^\d{4}-\d{2}-\d{2}$'
      then new.raw_user_meta_data ->> 'terms_version'
  end;

  insert into public.profiles (id, role, full_name, locale, terms_version, terms_accepted_at)
  values (
    new.id,
    v_role,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'locale', 'ar'),
    v_terms,
    case when v_terms is not null then now() end
  );

  if v_team_hash is not null then
    perform private.claim_team_invite(new.id, new.email, v_team_hash);
  elsif v_role = 'coach' and not coalesce((new.raw_user_meta_data ->> 'team_invite')::boolean, false) then
    insert into public.coaches (id, business_name, slug)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'business_name', 'My Coaching Business'),
      'coach-' || replace(new.id::text, '-', '')
    );
  end if;

  if v_role = 'client' then
    update public.clients
    set profile_id = new.id, status = 'active'
    where id = v_invite.client_id and profile_id is null;

    update public.invites set accepted_at = now() where id = v_invite.id;
  end if;

  return new;
end;
$$;
