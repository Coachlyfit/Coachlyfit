-- Admin "Online now" redesign. Three things the old page (list_online_users)
-- could not answer:
--
--  * "Never logged in". profiles.last_seen_at only exists since 20260914, so
--    null there also means "has an account, hasn't opened the app since".
--    Every function below reads coalesce(last_seen_at, auth.users.
--    last_sign_in_at) instead, and includes invited clients that have no
--    account at all (list_online_users inner-joins profiles and drops them).
--  * Who is connected right now, without polling: a private Realtime
--    Presence topic every signed-in user tracks and only admins may read.
--  * A fresh join link for a client who never signed up (invites are
--    coach-only under RLS).
--
-- Clients are attached to a coach through their active coaching_relationships
-- row (not the deprecated clients.coach_id mirror); a client with no active
-- relationship is not counted, so every number here can be found in a list.

create function public.admin_online_summary()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result json;
  -- "Today" is the Cairo calendar day, not a rolling 24h.
  v_today timestamptz := date_trunc('day', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo';
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  with coach_rows as (
    select
      c.id as r_id,
      coalesce(nullif(p.full_name, ''), c.business_name) as r_name,
      coalesce(p.last_seen_at, u.last_sign_in_at) as r_seen
    from public.coaches c
    join public.profiles p on p.id = c.id
    left join auth.users u on u.id = c.id
  ),
  client_rows as (
    select
      cr.coach_id as r_coach_id,
      cl.profile_id as r_profile_id,
      coalesce(p.last_seen_at, u.last_sign_in_at) as r_seen
    from public.clients cl
    join public.coaching_relationships cr on cr.client_id = cl.id and cr.status = 'active'
    left join public.profiles p on p.id = cl.profile_id
    left join auth.users u on u.id = cl.profile_id
    where cl.status <> 'archived'
  ),
  people as (
    select r_seen from coach_rows
    union all
    select r_seen from client_rows
  )
  select json_build_object(
    'coach_total', (select count(*) from coach_rows),
    'client_total', (select count(*) from client_rows),
    'active_today', (select count(*) from people where r_seen >= v_today),
    'active_7d', (select count(*) from people where r_seen >= now() - interval '7 days'),
    'never_count', (select count(*) from people where r_seen is null),
    'coaches', (
      select coalesce(
        json_agg(
          json_build_object(
            'id', co.r_id,
            'name', co.r_name,
            'last_seen_at', co.r_seen,
            'client_total', (select count(*) from client_rows x where x.r_coach_id = co.r_id),
            -- Account ids only: enough to turn the presence state into a
            -- per-coach "online / total" without loading any client rows.
            'client_user_ids', (
              select coalesce(json_agg(x.r_profile_id), '[]'::json)
              from client_rows x
              where x.r_coach_id = co.r_id and x.r_profile_id is not null
            )
          )
          order by co.r_seen desc nulls last, co.r_name
        ),
        '[]'::json
      )
      from coach_rows co
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_online_summary() from public, anon;
grant execute on function public.admin_online_summary() to authenticated;

-- One coach's roster. Output columns are only ever referenced table-qualified
-- inside the body (see 20260914000002 for what happens otherwise).
create function public.admin_coach_clients(p_coach_id uuid)
returns table (
  client_id uuid,
  user_id uuid,
  name text,
  last_seen_at timestamptz,
  can_invite boolean
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
    select
      cl.id,
      cl.profile_id,
      coalesce(cl.display_name, p.full_name),
      coalesce(p.last_seen_at, u.last_sign_in_at),
      cl.profile_id is null
    from public.clients cl
    join public.coaching_relationships cr on cr.client_id = cl.id and cr.status = 'active'
    left join public.profiles p on p.id = cl.profile_id
    left join auth.users u on u.id = cl.profile_id
    where cr.coach_id = p_coach_id and cl.status <> 'archived'
    order by coalesce(p.last_seen_at, u.last_sign_in_at) desc nulls last, cl.display_name;
end;
$$;

revoke execute on function public.admin_coach_clients(uuid) from public, anon;
grant execute on function public.admin_coach_clients(uuid) to authenticated;

-- The audit row targets the coach (target_user_id is not null and an invited
-- client has no user id); the client goes in details.
alter table public.admin_audit_log drop constraint admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check check (action in (
  'profile_update', 'email_change', 'password_reset',
  'role_change', 'suspend', 'unsuspend', 'delete',
  'invite_link_created'
));

-- Admin counterpart of InvitesService.regenerateInvite(): a new single-use
-- token for a client who has no account yet. Same contract as the coach
-- path -- the caller generates the token and only its sha256 hex is stored.
-- Returns the coach's slug, which the join URL is built on.
create function public.admin_create_invite(p_client_id uuid, p_token_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid;
  v_slug text;
  v_profile_id uuid;
  v_name text;
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid token hash.' using errcode = '22023';
  end if;

  select cr.coach_id, c.slug, cl.profile_id, cl.display_name
  into v_coach_id, v_slug, v_profile_id, v_name
  from public.clients cl
  join public.coaching_relationships cr on cr.client_id = cl.id and cr.status = 'active'
  join public.coaches c on c.id = cr.coach_id
  where cl.id = p_client_id and cl.status <> 'archived';

  if not found then
    raise exception 'Client not found.' using errcode = 'P0002';
  end if;
  if v_profile_id is not null then
    raise exception 'Client already has an account.' using errcode = '22023';
  end if;

  insert into public.invites (coach_id, client_id, token_hash)
  values (v_coach_id, p_client_id, p_token_hash);

  perform private.log_admin_action(
    v_coach_id,
    'invite_link_created',
    jsonb_build_object('client_id', p_client_id, 'client_name', v_name)
  );

  return v_slug;
end;
$$;

revoke execute on function public.admin_create_invite(uuid, text) from public, anon;
grant execute on function public.admin_create_invite(uuid, text) to authenticated;

-- Realtime authorization for the private "presence:online" topic. Joining
-- needs at least one of read/write, so everyone can join and track, but the
-- presence state is only delivered to admins. The presence key is chosen by
-- the client, so this is a display signal, not an authority -- last_seen_at
-- (written by touch_last_seen() from auth.uid()) stays the record.
create policy presence_online_track on realtime.messages
  for insert to authenticated
  with check ((select realtime.topic()) = 'presence:online' and extension = 'presence');

create policy presence_online_admin_listen on realtime.messages
  for select to authenticated
  using (
    (select realtime.topic()) = 'presence:online'
    and extension = 'presence'
    and (select private.is_admin())
  );
