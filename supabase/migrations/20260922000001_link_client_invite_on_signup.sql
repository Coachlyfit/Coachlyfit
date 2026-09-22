-- Bug: accept_invite() only ever ran from a path that depends on the
-- invite_token query param surviving Supabase's redirect allow-list (see
-- src/app/auth/confirm/route.ts). When the allow-list doesn't exactly match
-- emailRedirectTo, Supabase strips the query string — the account still
-- gets confirmed, but public.clients.profile_id is never set, and the
-- client is stuck: valid session, role='client', but no coach link, so
-- every check-in/form submit RLS-fails with a misleading "sign in again".
--
-- Fix: link the client inside handle_new_user() itself, in the same
-- transaction as the profiles insert, so there is no window where a
-- confirmed client exists unlinked. Keyed on a sha256 token hash carried
-- in signup metadata (not the raw token — raw_user_meta_data is
-- user-writable via auth.updateUser and is copied into the JWT as
-- user_metadata; a bearer secret does not belong there). The hash cannot
-- be replayed through accept_invite(p_token text), which hashes its own
-- input, so this grants nothing extra even if read back.
--
-- accept_invite() itself is unchanged and stays the path for the two
-- existing session-bearing callers (the confirm route, and the
-- immediate-session branch in join/[token]/actions.ts) — whichever of
-- those runs after this trigger just finds accepted_at is not null and
-- raises P0002, which callers already treat as a no-op success.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_invite_hash text;
  v_invite public.invites;
begin
  v_role := coalesce(
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    'coach'
  );

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

  -- Client-invite signup: link straight away instead of waiting on a
  -- confirm-link round trip. No rate limiting here (unlike accept_invite) —
  -- ponytail: there's no token to brute-force, guessing a sha256 hex is
  -- exactly as hard as guessing the plaintext token it hashes.
  if v_role = 'client' then
    v_invite_hash := new.raw_user_meta_data ->> 'invite_token_hash';
    if v_invite_hash is not null then
      select * into v_invite
      from public.invites
      where token_hash = v_invite_hash
        and accepted_at is null
        and expires_at > now();

      if v_invite.id is not null then
        -- profile_id is null guard respects clients_profile_id_idx (partial
        -- unique index) — a double-link becomes a no-op, not a conflict.
        -- No exception handler: a genuine conflict means the invite belongs
        -- to someone else, and failing the signup is the honest outcome.
        update public.clients
        set profile_id = new.id, status = 'active'
        where id = v_invite.client_id and profile_id is null;

        update public.invites set accepted_at = now() where id = v_invite.id;
      end if;
    end if;
  end if;

  return new;
end;
$$;
