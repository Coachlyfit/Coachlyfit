-- Team seats: lets a coach invite additional login accounts (profiles with
-- role='coach') that share the SAME tenant instead of each getting their own
-- coaches row. The owner is identified structurally (profiles.id =
-- coaches.id, unchanged from before this migration) and can never be
-- removed via this table -- only additional members are rows here. All
-- accepted members have full tenant-equivalent access in this first cut;
-- granular per-member permissions are an explicit, deliberately deferred
-- follow-up (see the roadmap doc), not an oversight.
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  email text not null,
  token_hash text unique,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  invited_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index team_members_coach_id_idx on public.team_members (coach_id);
-- Mirrors clients_profile_id_idx's shape/comment in 20260731000005_clients_invites.sql:
-- a profile can belong to at most one tenant as a team member.
create unique index team_members_profile_id_idx on public.team_members (profile_id) where profile_id is not null;

alter table public.team_members enable row level security;

create policy coach_rw on public.team_members
  for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));

grant select, insert, update, delete on public.team_members to authenticated;
grant select, insert, update, delete on public.team_members to service_role;

-- Redefine the two tenant-resolution helpers so every existing RLS policy
-- in the schema (which all indirect through these two functions, never
-- auth.uid() directly -- see 20260731000004_private_helpers.sql's own
-- comment on this) transparently starts covering team members too, with
-- ZERO changes to any other policy statement anywhere else in the schema.
create or replace function private.coach_id()
returns uuid
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  return coalesce(
    (
      select p.id from public.profiles p
      join public.coaches c on c.id = p.id
      where p.id = (select auth.uid()) and p.role = 'coach'
    ),
    (
      select tm.coach_id from public.team_members tm
      where tm.profile_id = (select auth.uid()) and tm.accepted_at is not null
    )
  );
end;
$$;

create or replace function private.tenant_id()
returns uuid
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  return (
    select case p.role
      when 'coach' then private.coach_id()
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

-- handle_new_user() must NOT create a coaches row for a team-invite signup
-- even though it signs up with role:'coach' metadata (kept as 'coach' so
-- every existing role==='coach' authorization check in the app keeps
-- working unchanged for team members too) -- a 'team_invite' flag in the
-- signup metadata suppresses just that one insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
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

  return new;
end;
$$;

-- Mirrors accept_invite() in 20260731000005_clients_invites.sql almost
-- exactly: same token hashing, same reuse of the existing invite_attempts
-- rate-limit table (generic per-IP counter, not client-specific despite its
-- name/original table comment -- reusing it here rather than adding a
-- parallel table). The one extra guard accept_invite() doesn't need: refuse
-- if the caller's own account already owns a tenant (has a coaches row) --
-- accepting a second tenant's invite on that account would make
-- private.coach_id()'s COALESCE ambiguous about which tenant wins, so this
-- is refused outright rather than silently picking one.
create function public.accept_team_invite(p_token text, p_ip inet default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.team_members%rowtype;
  v_attempts int;
begin
  if p_ip is not null then
    insert into public.invite_attempts (ip, attempts, window_started_at)
    values (p_ip, 1, now())
    on conflict (ip) do update set
      attempts = case
        when public.invite_attempts.window_started_at < now() - interval '1 hour'
          then 1
        else public.invite_attempts.attempts + 1
      end,
      window_started_at = case
        when public.invite_attempts.window_started_at < now() - interval '1 hour'
          then now()
        else public.invite_attempts.window_started_at
      end
    returning attempts into v_attempts;

    if v_attempts > 20 then
      raise exception 'Too many attempts. Try again later.' using errcode = '42901';
    end if;
  end if;

  select * into v_row
  from public.team_members
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if v_row.id is null then
    raise exception 'Invalid or expired invite.' using errcode = 'P0002';
  end if;
  if v_row.accepted_at is not null then
    raise exception 'This invite has already been used.' using errcode = 'P0002';
  end if;
  if v_row.expires_at < now() then
    raise exception 'This invite has expired.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.coaches where id = (select auth.uid())) then
    raise exception 'This account already owns a coaching business.' using errcode = 'P0002';
  end if;

  update public.team_members
  set profile_id = (select auth.uid()), accepted_at = now()
  where id = v_row.id;

  return json_build_object('coach_id', v_row.coach_id);
end;
$$;

revoke execute on function public.accept_team_invite(text, inet) from public;
grant execute on function public.accept_team_invite(text, inet) to authenticated;
