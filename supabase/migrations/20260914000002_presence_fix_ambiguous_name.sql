-- Fixes a bug in 20260914000001_presence.sql's list_online_users(): the
-- original CTE column `name` collided with the function's RETURNS TABLE
-- output column of the same name -- plpgsql implicitly declares every
-- RETURNS TABLE column as a variable in scope for the whole function body,
-- so referencing `name` bare inside the query raised
-- 42702 "column reference \"name\" is ambiguous". Hit in production on
-- first load of /admin/online (Vercel runtime error, digest 2218339886).
--
-- Fix: renamed the CTE column to base_name, aliased back to `name` only in
-- the final select list. See 20260914000001_presence.sql's inline comment
-- for the same explanation.
create or replace function public.list_online_users(
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  user_id uuid,
  name text,
  avatar_url text,
  role public.user_role,
  coach_id uuid,
  coach_name text,
  last_seen_at timestamptz,
  online boolean,
  total_count bigint,
  online_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean := private.is_admin();
  v_coach_id uuid := private.coach_id();
begin
  if not v_is_admin and v_coach_id is null then
    raise exception 'Coach or admin only.' using errcode = '42501';
  end if;

  return query
    with base as (
      select
        p.id as user_id,
        coalesce(cl.display_name, p.full_name) as base_name,
        p.avatar_url,
        p.role,
        cl.coach_id,
        coachp.full_name as coach_name,
        p.last_seen_at
      from public.clients cl
      join public.profiles p on p.id = cl.profile_id
      left join public.profiles coachp on coachp.id = cl.coach_id
      where cl.status <> 'archived'
        and (v_is_admin or cl.coach_id = v_coach_id)

      union all

      select
        c.id as user_id,
        p.full_name as base_name,
        p.avatar_url,
        p.role,
        c.id as coach_id,
        p.full_name as coach_name,
        p.last_seen_at
      from public.coaches c
      join public.profiles p on p.id = c.id
      where v_is_admin
    ),
    filtered as (
      select *
      from base
      where p_search is null or p_search = '' or base_name ilike '%' || p_search || '%'
    )
    select
      user_id,
      base_name as name,
      avatar_url,
      role,
      coach_id,
      coach_name,
      last_seen_at,
      (last_seen_at is not null and last_seen_at >= now() - interval '5 minutes') as online,
      count(*) over () as total_count,
      count(*) filter (
        where last_seen_at is not null and last_seen_at >= now() - interval '5 minutes'
      ) over () as online_count
    from filtered
    order by online desc, last_seen_at desc nulls last, base_name
    limit p_limit offset p_offset;
end;
$$;

revoke execute on function public.list_online_users(text, int, int) from public;
grant execute on function public.list_online_users(text, int, int) to authenticated;
