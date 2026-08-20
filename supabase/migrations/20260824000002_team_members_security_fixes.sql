-- Fixes three authorization-boundary bugs found in security review of
-- 20260824000001_team_members.sql. That migration is already applied, so
-- this fixes forward (redefines functions, adds policies) rather than
-- editing it in place -- same relationship 20260824000001 itself has to
-- 20260731000004_private_helpers.sql's original private.coach_id().

-- ---------------------------------------------------------------------------
-- 1. Privilege escalation: private.coach_id()'s team_members branch granted
-- tenant access to ANY authenticated profile with an accepted team_members
-- row, with no profiles.role = 'coach' check -- unlike its own owner branch,
-- which already requires one. Combined with accept_team_invite() not
-- checking the caller's role either (fixed in #3 below), any authenticated
-- account of any role (e.g. one of the coach's own clients) that obtained a
-- leaked/forwarded/unused invite token could redeem it and gain full
-- read/write access to the coach's entire tenant. Bring the second branch
-- in line with the first.
-- ---------------------------------------------------------------------------
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
      where p.id = (select auth.uid()) and p.role = 'coach'
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

-- ---------------------------------------------------------------------------
-- 2. coaches itself was never updated to route through private.coach_id()
-- like every other tenant table was -- team members could not read or
-- update the coach's business_name / default_checkin_template_id (RLS
-- silently filtered the row to zero, not an error). These are additive:
-- RLS OR's permissive policies together, so the pre-existing owner-only
-- coaches_select_own / coaches_update_own (20260731000003_coaches.sql) are
-- untouched and still apply.
-- ---------------------------------------------------------------------------
create policy coaches_select_team on public.coaches
  for select to authenticated
  using (id = (select private.coach_id()));

create policy coaches_update_team on public.coaches
  for update to authenticated
  using (id = (select private.coach_id()))
  with check (id = (select private.coach_id()));

-- ---------------------------------------------------------------------------
-- 3. accept_team_invite(): explicitly guard the caller's role (fails before
-- the token is consumed, so a wrong-role caller can't burn a legitimate
-- invite -- the row stays untouched for the real invitee to accept later),
-- and close the SELECT-then-UPDATE TOCTOU race the same way
-- admin_promote_exercise() does in 20260801000015_library_source.sql: lock
-- the row with `for update` on the initial SELECT, and make the UPDATE's
-- WHERE clause itself (not the earlier SELECT snapshot) the source of truth
-- for "was this already accepted".
-- ---------------------------------------------------------------------------
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

  update public.team_members
  set profile_id = (select auth.uid()), accepted_at = now()
  where id = v_row.id and accepted_at is null;

  if not found then
    raise exception 'This invite has already been used.' using errcode = 'P0002';
  end if;

  return json_build_object('coach_id', v_row.coach_id);
end;
$$;
