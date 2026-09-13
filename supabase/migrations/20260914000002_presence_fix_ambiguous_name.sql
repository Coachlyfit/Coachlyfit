-- Second round of the same bug class as this filename's original fix:
-- every CTE column whose name matches a RETURNS TABLE output column is
-- ambiguous in plpgsql, not just `name` -- `user_id` also collided (hit in
-- production on /dashboard and /admin/online, digest 1924104686 /
-- 2398786381). Rather than chase each output column one at a time,
-- prefixed every CTE column with r_ so none of them can collide with an
-- output column ever again.
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
        p.id as r_user_id,
        coalesce(cl.display_name, p.full_name) as r_name,
        p.avatar_url as r_avatar_url,
        p.role as r_role,
        cl.coach_id as r_coach_id,
        coachp.full_name as r_coach_name,
        p.last_seen_at as r_last_seen_at
      from public.clients cl
      join public.profiles p on p.id = cl.profile_id
      left join public.profiles coachp on coachp.id = cl.coach_id
      where cl.status <> 'archived'
        and (v_is_admin or cl.coach_id = v_coach_id)

      union all

      select
        c.id as r_user_id,
        p.full_name as r_name,
        p.avatar_url as r_avatar_url,
        p.role as r_role,
        c.id as r_coach_id,
        p.full_name as r_coach_name,
        p.last_seen_at as r_last_seen_at
      from public.coaches c
      join public.profiles p on p.id = c.id
      where v_is_admin
    ),
    filtered as (
      select *
      from base
      where p_search is null or p_search = '' or r_name ilike '%' || p_search || '%'
    )
    select
      r_user_id,
      r_name,
      r_avatar_url,
      r_role,
      r_coach_id,
      r_coach_name,
      r_last_seen_at,
      (r_last_seen_at is not null and r_last_seen_at >= now() - interval '5 minutes'),
      count(*) over (),
      count(*) filter (
        where r_last_seen_at is not null and r_last_seen_at >= now() - interval '5 minutes'
      ) over ()
    from filtered
    order by (r_last_seen_at is not null and r_last_seen_at >= now() - interval '5 minutes') desc,
      r_last_seen_at desc nulls last, r_name
    limit p_limit offset p_offset;
end;
$$;

revoke execute on function public.list_online_users(text, int, int) from public;
grant execute on function public.list_online_users(text, int, int) to authenticated;
