-- Audit trail for admin actions on users (who did what to whom).
--
-- Rows snapshot admin/target name+email and carry NO foreign keys: the point
-- is that the record survives the target being deleted (and the admin being
-- removed later). Written only by security definer functions (actor comes
-- from auth.uid(), never from the client); admins can read, nobody can
-- write/update/delete through RLS -- no policies exist for those commands.

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_id uuid not null,
  admin_name text,
  target_user_id uuid not null,
  target_name text,
  target_email text,
  action text not null check (action in (
    'profile_update', 'email_change', 'password_reset',
    'role_change', 'suspend', 'unsuspend', 'delete'
  )),
  details jsonb not null default '{}'::jsonb
);

create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_target_idx on public.admin_audit_log (target_user_id, created_at desc);

alter table public.admin_audit_log enable row level security;

create policy admin_audit_log_admin_read on public.admin_audit_log
  for select to authenticated
  using (private.is_admin());

-- Shared writer. p_email / p_name let a caller supply the snapshot when the
-- target is about to disappear (delete); otherwise it is looked up here.
create function private.log_admin_action(
  p_target uuid,
  p_action text,
  p_details jsonb default '{}'::jsonb,
  p_email text default null,
  p_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_audit_log (
    admin_id, admin_name, target_user_id, target_name, target_email, action, details
  )
  values (
    (select auth.uid()),
    (select full_name from public.profiles where id = (select auth.uid())),
    p_target,
    coalesce(p_name, (select full_name from public.profiles where id = p_target)),
    coalesce(p_email, (select email::text from auth.users where id = p_target)),
    p_action,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

revoke execute on function private.log_admin_action(uuid, text, jsonb, text, text) from public;

-- Endpoint for the actions that run through the Auth Admin API (email
-- change, password reset, delete): the server action calls this AFTER the
-- auth call succeeds. Actor is auth.uid() inside the writer, not a parameter.
create function public.admin_log_user_action(
  p_target uuid,
  p_action text,
  p_details jsonb default '{}'::jsonb,
  p_target_email text default null,
  p_target_name text default null
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
  if p_action not in ('email_change', 'password_reset', 'delete') then
    raise exception 'Unknown action.' using errcode = '22023';
  end if;

  perform private.log_admin_action(p_target, p_action, p_details, p_target_email, p_target_name);
end;
$$;

revoke execute on function public.admin_log_user_action(uuid, text, jsonb, text, text) from public;
grant execute on function public.admin_log_user_action(uuid, text, jsonb, text, text) to authenticated;

-- Existing DB-only mutations now log themselves.
create or replace function public.admin_update_user_profile(
  p_user_id uuid,
  p_full_name text,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.profiles;
  v_name text := nullif(btrim(p_full_name), '');
  v_phone text := nullif(btrim(p_phone), '');
  v_details jsonb := '{}'::jsonb;
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  select * into v_old from public.profiles where id = p_user_id;
  if not found then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;

  update public.profiles set full_name = v_name, phone = v_phone where id = p_user_id;

  if v_old.full_name is distinct from v_name then
    v_details := v_details || jsonb_build_object('full_name', jsonb_build_object('from', v_old.full_name, 'to', v_name));
  end if;
  if v_old.phone is distinct from v_phone then
    v_details := v_details || jsonb_build_object('phone', jsonb_build_object('from', v_old.phone, 'to', v_phone));
  end if;
  if v_details <> '{}'::jsonb then
    perform private.log_admin_action(p_user_id, 'profile_update', v_details);
  end if;
end;
$$;

create or replace function public.admin_set_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.user_role;
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'Cannot change your own role.' using errcode = '42501';
  end if;

  select role into v_old from public.profiles where id = p_user_id;
  update public.profiles set role = p_role where id = p_user_id;

  if v_old is distinct from p_role then
    perform private.log_admin_action(
      p_user_id, 'role_change',
      jsonb_build_object('role', jsonb_build_object('from', v_old, 'to', p_role))
    );
  end if;
end;
$$;

create or replace function public.admin_set_suspended(p_user_id uuid, p_suspended boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'Cannot suspend your own account.' using errcode = '42501';
  end if;

  update public.profiles
  set suspended_at = case when p_suspended then now() else null end
  where id = p_user_id;

  perform private.log_admin_action(p_user_id, case when p_suspended then 'suspend' else 'unsuspend' end);
end;
$$;
