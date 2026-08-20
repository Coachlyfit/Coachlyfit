-- Tenant-resolution helpers used by every RLS policy from here on.
--
-- Deliberately NOT in the `auth` schema (a common pattern in older Supabase
-- examples): `auth.*` is reserved for Supabase's own internals and a future
-- Auth upgrade could collide with a same-named function. `private` is not
-- in the exposed-schema list (only `public`/`graphql_public` are by
-- default), so these are just as unreachable from the API as `auth.*`
-- would have been, with none of the collision risk.
--
-- Each policy MUST call these wrapped in a scalar subquery —
-- `using (coach_id = (select private.tenant_id()))`, never bare — so
-- Postgres evaluates the (stable, security definer) function once per
-- statement as an InitPlan instead of once per row.
--
-- Two different "whose data is this" functions, not one, because they
-- authorize different things:
--   tenant_id() — coach OR client, resolves to the coach's id either way.
--                 Safe ONLY for read policies that are meant to include
--                 clients (e.g. "see your coach's exercise library").
--   coach_id()  — coach ONLY; null for a client even though their tenant
--                 matches. Required for every write / full-CRUD policy, so
--                 a client can never insert/update/delete tenant data just
--                 because `coach_id = their coach's id` would otherwise be
--                 true.
create schema if not exists private;
grant usage on schema private to authenticated;

-- plpgsql, not sql: this references public.clients, which is created in a
-- later migration. A `language sql` function is parsed (and its referenced
-- relations validated) at CREATE FUNCTION time; plpgsql defers that to
-- first call, so the forward reference is fine. Volatility (stable) is
-- what makes the caller's `(select private.tenant_id())` InitPlan caching
-- work, and that's independent of sql vs plpgsql.
create function private.tenant_id()
returns uuid
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  return (
    select case p.role
      when 'coach' then p.id
      when 'client' then (
        select c.coach_id from public.clients c
        where c.profile_id = p.id
        limit 1
      )
      else null
    end
    from public.profiles p
    where p.id = (select auth.uid())
  );
end;
$$;

create function private.coach_id()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select p.id from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'coach'
$$;

create function private.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists(
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
$$;

-- plpgsql for the same forward-reference reason as tenant_id() above.
create function private.client_id()
returns uuid
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  return (
    select c.id from public.clients c
    where c.profile_id = (select auth.uid())
  );
end;
$$;

revoke execute on function private.tenant_id() from public;
revoke execute on function private.coach_id() from public;
revoke execute on function private.is_admin() from public;
revoke execute on function private.client_id() from public;
grant execute on function private.tenant_id() to authenticated;
grant execute on function private.coach_id() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.client_id() to authenticated;
