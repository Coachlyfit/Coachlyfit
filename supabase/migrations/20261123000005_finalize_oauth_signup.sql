-- Finishes a brand-new Google (OAuth) signup.
--
-- signInWithOAuth can't carry signup metadata, so handle_new_user() sees only
-- Google's own claims: every new Google user lands as a coach with a trial,
-- no terms record, locale 'ar', and any invite hash unreadable. The auth
-- callback calls this once, right after the code exchange, to:
--   * record the terms the user ticked and their locale (these profile columns
--     are not user-writable, hence a definer function);
--   * for a client invite, link the invite exactly like accept_invite() and
--     archive the empty workspace/trial the trigger auto-created.
-- Team invites don't go through here for linking: the callback follows up with
-- the existing accept_team_invite().
--
-- One-shot by construction: only a Google-provider user whose profile has no
-- terms yet and was created in the last 10 minutes can call it, so it can't be
-- used later to rewrite terms/locale or to turn an established account into a
-- client.

create or replace function public.finalize_oauth_signup(
  p_terms_version text,
  p_locale text,
  p_invite_token text default null,
  p_ip inet default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_provider text;
  v_profile public.profiles%rowtype;
  v_invite public.invites%rowtype;
  v_attempts int;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  select raw_app_meta_data ->> 'provider' into v_provider
  from auth.users where id = v_uid;
  if v_provider is distinct from 'google' then
    raise exception 'Only a Google sign-up can be finalized.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if v_profile.id is null
     or v_profile.terms_accepted_at is not null
     or v_profile.created_at < now() - interval '10 minutes' then
    raise exception 'This account is already set up.' using errcode = 'P0002', hint = 'already_finalized';
  end if;

  if p_terms_version is null or p_terms_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Invalid terms version.' using errcode = '22023';
  end if;
  if p_locale is null or p_locale not in ('ar', 'en') then
    raise exception 'Invalid locale.' using errcode = '22023';
  end if;

  update public.profiles
  set terms_version = p_terms_version,
      terms_accepted_at = now(),
      locale = p_locale
  where id = v_uid;

  if p_invite_token is null then
    return json_build_object('role', v_profile.role);
  end if;

  -- Same per-IP brute-force guard as accept_invite().
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

  select * into v_invite
  from public.invites
  where token_hash = encode(extensions.digest(p_invite_token, 'sha256'), 'hex')
  for update;

  if v_invite.id is null then
    raise exception 'Invalid or expired invite.' using errcode = 'P0002';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'This invite has already been used.' using errcode = 'P0002';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'This invite has expired.' using errcode = 'P0002';
  end if;

  -- Drop the workspace + trial the trigger made for this (new) user. Refuse
  -- rather than archive anything that isn't truly empty.
  if exists (select 1 from public.coaches where id = v_uid and archived_at is null) then
    if not private.team_workspace_is_empty(v_uid) then
      raise exception 'This account already owns a coaching business.'
        using errcode = 'P0002', hint = 'owns_business';
    end if;
    update public.coaches set archived_at = now() where id = v_uid;
    update public.subscriptions set status = 'canceled'
    where coach_id = v_uid and status = 'trialing';
  end if;

  update public.clients
  set profile_id = v_uid, status = 'active'
  where id = v_invite.client_id and profile_id is null;
  if not found then
    raise exception 'This invite has already been used.' using errcode = 'P0002';
  end if;

  update public.profiles set role = 'client' where id = v_uid;
  update public.invites set accepted_at = now() where id = v_invite.id;

  return json_build_object('role', 'client', 'coach_id', v_invite.coach_id, 'client_id', v_invite.client_id);
end;
$$;

revoke execute on function public.finalize_oauth_signup(text, text, text, inet) from public, anon;
grant execute on function public.finalize_oauth_signup(text, text, text, inet) to authenticated;
