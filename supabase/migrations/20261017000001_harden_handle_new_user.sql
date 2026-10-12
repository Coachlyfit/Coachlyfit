-- Privilege escalation: handle_new_user() cast raw_user_meta_data->>'role'
-- straight into user_role. Signup metadata is caller-supplied, so anyone
-- calling auth.signUp() directly with role:'admin' became a platform admin.
--
-- The role is now derived, never copied:
--   * 'client' only when the metadata also carries the hash of an open
--     invite. Without one the signup is rejected: falling back to 'coach'
--     would hand an invitee a coaching tenant and a trial they never asked
--     for, and an unlinked client account is a dead end. No account is
--     created, so they can retry with a fresh invite and the same email.
--   * everything else (including 'admin') is 'coach'. Admins are made only
--     through admin_set_role().
--
-- accept_invite() is unchanged: it still links an already signed-in account
-- and sets its role itself.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := 'coach';
  v_invite public.invites;
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
  end if;

  insert into public.profiles (id, role, full_name, locale)
  values (
    new.id,
    v_role,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'locale', 'ar')
  );

  if v_role = 'coach' and not coalesce((new.raw_user_meta_data ->> 'team_invite')::boolean, false) then
    insert into public.coaches (id, business_name, slug)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'business_name', 'My Coaching Business'),
      'coach-' || replace(new.id::text, '-', '')
    );
  end if;

  -- Client-invite signup: link in the same transaction as the profile row
  -- (see 20260922000001_link_client_invite_on_signup.sql).
  if v_role = 'client' then
    -- profile_id is null guard respects clients_profile_id_idx (partial
    -- unique index) — a double-link becomes a no-op, not a conflict.
    update public.clients
    set profile_id = new.id, status = 'active'
    where id = v_invite.client_id and profile_id is null;

    update public.invites set accepted_at = now() where id = v_invite.id;
  end if;

  return new;
end;
$$;
