-- Admin edit/delete of any user from the Users tab.
--
-- Profile edits go through admin_update_user_profile (RLS-respecting
-- definer function, admin guard inside). Email change and hard delete need
-- the Auth Admin API (service_role), which has no RLS-aware equivalent --
-- admin_authorize_user_action is the DB-side gate the server action must
-- pass BEFORE it touches the service-role client (same pattern as
-- begin_impersonation).

create function public.admin_update_user_profile(
  p_user_id uuid,
  p_full_name text,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  update public.profiles
  set full_name = nullif(btrim(p_full_name), ''),
      phone = nullif(btrim(p_phone), '')
  where id = p_user_id;

  if not found then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- p_action: 'delete' | 'email'. Returns the target's role.
-- delete: refuses self and other admins (demote first) -- an admin deleting
-- themselves or the last admin has no recovery path, and admins own
-- no-action FKs (payments.recorded_by etc.) that would fail the delete anyway.
create function public.admin_authorize_user_action(p_user_id uuid, p_action text)
returns public.user_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;
  if p_action not in ('delete', 'email') then
    raise exception 'Unknown action.' using errcode = '22023';
  end if;

  select role into v_role from public.profiles where id = p_user_id;
  if not found then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;

  if p_action = 'delete' then
    if p_user_id = (select auth.uid()) then
      raise exception 'Cannot delete your own account.' using errcode = '42501';
    end if;
    if v_role = 'admin' then
      raise exception 'Demote this admin before deleting.' using errcode = '42501';
    end if;
  end if;

  return v_role;
end;
$$;

revoke execute on function public.admin_update_user_profile(uuid, text, text) from public;
revoke execute on function public.admin_authorize_user_action(uuid, text) from public;
grant execute on function public.admin_update_user_profile(uuid, text, text) to authenticated;
grant execute on function public.admin_authorize_user_action(uuid, text) to authenticated;
