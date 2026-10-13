-- Records which version of the legal pages an account accepted at signup.
-- The version is the date in src/content/legal/constants.ts (LEGAL_VERSION).
--
-- No new RLS policy: profiles_select_own already lets a user read their own
-- row, and the two columns are deliberately absent from the column-level
-- UPDATE grant (20261023000001_profiles_column_grants.sql), so only this
-- trigger can write them. Accounts that predate this migration stay null.
alter table public.profiles
  add column terms_accepted_at timestamptz,
  add column terms_version text check (terms_version ~ '^\d{4}-\d{2}-\d{2}$');

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

  -- Caller-supplied, so only a well-formed date is kept; anything else is
  -- treated as "no acceptance recorded" rather than failing the signup.
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

  if v_role = 'coach' and not coalesce((new.raw_user_meta_data ->> 'team_invite')::boolean, false) then
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
