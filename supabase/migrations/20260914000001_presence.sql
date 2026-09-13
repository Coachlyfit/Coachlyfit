-- "Online now" presence. Deliberately NOT the same concept as
-- clients.status = 'active' (accepted invite) or subscriptions.status =
-- 'active' (billing) -- those already own the word "active" elsewhere in
-- this schema, so presence uses "online"/"last_seen_at" throughout to avoid
-- a three-way collision. Online = last_seen_at within ONLINE_WINDOW_MINUTES
-- (5, kept in sync with src/domain/presence/presence.service.ts).

alter table public.profiles add column last_seen_at timestamptz;

-- Partial: most rows have never been online (coach never signed in this
-- session, or a stale/abandoned client) -- indexing only non-null rows
-- keeps it small and keeps "who's online" scans cheap.
create index profiles_last_seen_at_idx
  on public.profiles (last_seen_at desc)
  where last_seen_at is not null;

-- Heartbeat, called every ~60s by the client while the tab is visible (see
-- PresenceService.touch / presence-heartbeat.tsx). Own row only -- no
-- target-user argument, so there is nothing here for one user to spoof
-- another's presence with. Rate-limited server-side (skip the write if
-- touched in the last 30s) so a runaway client-side interval can't turn
-- this into a write-amplification vector.
create function public.touch_last_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set last_seen_at = now()
  where id = (select auth.uid())
    and (last_seen_at is null or last_seen_at < now() - interval '30 seconds');
$$;

revoke execute on function public.touch_last_seen() from public;
grant execute on function public.touch_last_seen() to authenticated;

-- Single role-scoped read endpoint (mirrors admin_list_coaches /
-- admin_list_users -- security definer, role branch inside the function,
-- not two ad-hoc queries in application code). No coach-id parameter: a
-- coach's scope is always private.coach_id(), resolved server-side, so
-- there is no argument a coach could tamper with to read another coach's
-- roster.
--
-- Returns one row per user-of-interest (coaches themselves, for the admin
-- view's tab headers, plus every non-archived client). total_count /
-- online_count are window-function aggregates over the *whole* matching
-- set, so they stay correct regardless of p_limit/p_offset.
create function public.list_online_users(
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
      -- Clients (a coach's roster). Archived clients never counted as
      -- online -- they're not meaningfully "on the platform" any more.
      select
        p.id as user_id,
        coalesce(cl.display_name, p.full_name) as name,
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

      -- Coaches themselves, admin-only -- gives the admin tab headers a
      -- coach row to show online/offline for, and a scan target even when
      -- a coach currently has zero clients.
      select
        c.id as user_id,
        p.full_name as name,
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
      where p_search is null or p_search = '' or name ilike '%' || p_search || '%'
    )
    select
      user_id,
      name,
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
    order by online desc, last_seen_at desc nulls last, name
    limit p_limit offset p_offset;
end;
$$;

revoke execute on function public.list_online_users(text, int, int) from public;
grant execute on function public.list_online_users(text, int, int) to authenticated;
