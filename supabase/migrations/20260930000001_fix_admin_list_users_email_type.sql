-- admin_list_users declared email as text, but auth.users.email is
-- varchar(255). plpgsql RETURN QUERY requires exact type match, so every call
-- raised 42804 "structure of query does not match function result type" and
-- the admin Users tab rendered empty. Cast to text.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  role public.user_role,
  suspended_at timestamptz,
  created_at timestamptz
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
    select p.id, p.full_name, u.email::text, p.phone, p.role, p.suspended_at, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;
