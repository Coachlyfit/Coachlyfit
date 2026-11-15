-- Soft-delete for clients: a coach "deletes" a client by stamping
-- clients.deleted_at. Everything the deleted client owns disappears from
-- every coach/client surface at once (RLS + the private.* access helpers),
-- stays restorable for 60 days, and is then hard-deleted by a daily pg_cron
-- job, which also removes the client's auth user.
--
-- Why RPCs and not a plain UPDATE: once the coach SELECT policy hides
-- deleted rows, `update ... set deleted_at = now()` fails its own
-- new-row check (the new row is no longer visible) and a restore can't see
-- the row it targets. The RPCs below do the same ownership check the RLS
-- policies do, explicitly. The UPDATE policy still exists so direct DML is
-- scoped identically (coach/assignee only, clients and other roles never).

-- ---------------------------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------------------------

alter table public.clients add column deleted_at timestamptz;

create index clients_deleted_at_idx on public.clients (deleted_at)
  where deleted_at is not null;

-- ---------------------------------------------------------------------------
-- 2. Related data goes with the client (ON DELETE CASCADE)
-- ---------------------------------------------------------------------------
-- Every other table already cascades from clients.id. Invoices were the one
-- deliberate NO ACTION ("archive, never delete"); with a 60-day soft-delete
-- window that guard is now the window itself, and without cascade the purge
-- job could never remove a client who had been invoiced.

alter table public.invoices drop constraint invoices_client_id_fkey;
alter table public.invoices
  add constraint invoices_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 3. Access helpers: a deleted client is invisible
-- ---------------------------------------------------------------------------
-- All security definer (they bypass RLS), so each needs the explicit filter.

-- Client login: a deleted client has no client id, so every client-side
-- policy (`client_id = private.client_id()`) stops matching.
create or replace function private.client_id()
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
      and c.deleted_at is null
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
          and c.deleted_at is null
        limit 1
      )
      else null
    end
    from public.profiles p
    where p.id = (select auth.uid())
  );
end;
$$;

create or replace function private.accessible_client_ids()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select c.id
  from public.clients c
  where c.coach_id = (select private.coach_id())
    and c.deleted_at is null
    and (
      (select private.is_team_owner())
      or c.assigned_to = (select auth.uid())
    )
$$;

-- Deleted clients of the caller's tenant. Policies that let the owner see
-- every row of a table (without going through accessible_client_ids) use
-- this to subtract the deleted ones.
create or replace function private.deleted_client_ids()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select c.id
  from public.clients c
  where c.coach_id = (select private.coach_id())
    and c.deleted_at is not null
$$;

revoke execute on function private.deleted_client_ids() from public;
grant execute on function private.deleted_client_ids() to authenticated;

create or replace function private.active_client_ids()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select r.client_id
  from public.coaching_relationships r
  where r.coach_id = (select private.coach_id())
    and r.status = 'active'
    and r.client_id in (select d.id from public.clients d where d.deleted_at is null)
    and (
      (select private.is_team_owner())
      or r.client_id in (
        select c.id from public.clients c
        where c.assigned_to = (select auth.uid())
          and c.coach_id = r.coach_id
      )
    )
$$;

create or replace function private.active_relationship_ids()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select r.id
  from public.coaching_relationships r
  where r.coach_id = (select private.coach_id())
    and r.status = 'active'
    and r.client_id in (select d.id from public.clients d where d.deleted_at is null)
    and (
      (select private.is_team_owner())
      or r.client_id in (
        select c.id from public.clients c
        where c.assigned_to = (select auth.uid())
          and c.coach_id = r.coach_id
      )
    )
$$;

create or replace function private.shared_client_ids()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select r.client_id
  from public.coaching_relationships r
  where r.coach_id = (select private.coach_id())
    and r.status = 'active'
    and r.share_history
    and r.client_id in (select d.id from public.clients d where d.deleted_at is null)
    and (
      (select private.is_team_owner())
      or r.client_id in (
        select c.id from public.clients c
        where c.assigned_to = (select auth.uid())
          and c.coach_id = r.coach_id
      )
    )
$$;

create or replace function private.visible_relationship_ids()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select r.id
  from public.coaching_relationships r
  where r.coach_id = (select private.coach_id())
    and r.status = 'active'
    and r.client_id in (select d.id from public.clients d where d.deleted_at is null)
    and (
      (select private.is_team_owner())
      or r.client_id in (
        select c.id from public.clients c
        where c.assigned_to = (select auth.uid())
          and c.coach_id = r.coach_id
      )
    )
  union
  select h.id
  from public.coaching_relationships r
  join public.coaching_relationships h
    on h.client_id = r.client_id and h.status = 'ended'
  where r.coach_id = (select private.coach_id())
    and r.status = 'active'
    and r.share_history
    and r.client_id in (select d.id from public.clients d where d.deleted_at is null)
    and (
      (select private.is_team_owner())
      or r.client_id in (
        select c.id from public.clients c
        where c.assigned_to = (select auth.uid())
          and c.coach_id = r.coach_id
      )
    )
$$;

-- ---------------------------------------------------------------------------
-- 4. clients policies
-- ---------------------------------------------------------------------------
-- coach_rw (for all) is split so SELECT hides deleted rows while UPDATE can
-- still stamp deleted_at. Scope is the same as before: the tenant owner
-- reaches every client, a team member only the ones assigned to them.

drop policy if exists coach_rw on public.clients;

create policy coach_select on public.clients
  for select to authenticated
  using (
    coach_id = (select private.coach_id())
    and deleted_at is null
    and (
      (select private.is_team_owner())
      or assigned_to = (select auth.uid())
    )
  );

create policy coach_insert on public.clients
  for insert to authenticated
  with check (
    coach_id = (select private.coach_id())
    and deleted_at is null
    and (
      (select private.is_team_owner())
      or assigned_to = (select auth.uid())
    )
  );

-- The only way a coach can set deleted_at: on a live client of their own
-- tenant (owner) or assigned to them (member). Clients have no UPDATE policy
-- at all, so they (and every other role) can never touch it.
create policy coach_update on public.clients
  for update to authenticated
  using (
    coach_id = (select private.coach_id())
    and deleted_at is null
    and (
      (select private.is_team_owner())
      or assigned_to = (select auth.uid())
    )
  )
  with check (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or assigned_to = (select auth.uid())
    )
  );

create policy coach_delete on public.clients
  for delete to authenticated
  using (
    coach_id = (select private.coach_id())
    and deleted_at is null
    and (
      (select private.is_team_owner())
      or assigned_to = (select auth.uid())
    )
  );

drop policy if exists client_read_own on public.clients;
create policy client_read_own on public.clients
  for select to authenticated
  using (profile_id = (select auth.uid()) and deleted_at is null);

-- ---------------------------------------------------------------------------
-- 5. Owner "see everything" read policies
-- ---------------------------------------------------------------------------
-- Same policies as 20261112000004 §7e, minus rows of deleted clients. These
-- short-circuit on is_team_owner() instead of going through
-- accessible_client_ids(), and can't switch to it: the owner must keep
-- reading their own billing history for clients who have since moved to
-- another coach (clients.coach_id no longer matches).

do $$
declare
  t text;
begin
  foreach t in array array[
    'client_observations',
    'client_subscriptions',
    'client_transactions',
    'coaching_decisions',
    'form_assignments',
    'invoices'
  ] loop
    execute format('drop policy if exists coach_read_own on public.%I', t);
    execute format($p$
      create policy coach_read_own on public.%I
        for select to authenticated
        using (
          coach_id = (select private.coach_id())
          and client_id not in (select private.deleted_client_ids())
          and (
            (select private.is_team_owner())
            or client_id in (select private.accessible_client_ids())
          )
        )
    $p$, t);
  end loop;

  foreach t in array array[
    'programs',
    'program_days',
    'program_items',
    'program_item_sets',
    'program_activities',
    'diet_plans',
    'meals',
    'meal_items',
    'rehab_protocols',
    'rehab_phases'
  ] loop
    execute format('drop policy if exists coach_read_own on public.%I', t);
    execute format($p$
      create policy coach_read_own on public.%I
        for select to authenticated
        using (
          coach_id = (select private.coach_id())
          and (client_id is null or client_id not in (select private.deleted_client_ids()))
          and (
            client_id is null
            or (select private.is_team_owner())
            or client_id in (select private.accessible_client_ids())
          )
        )
    $p$, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Seat cap: deleted clients don't count, restoring one re-checks the cap
-- ---------------------------------------------------------------------------

create or replace function private.enforce_client_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
  v_count int;
begin
  if not private.coach_has_access(new.coach_id) then
    raise exception 'An active subscription is required to add clients.'
      using errcode = 'P0001', hint = 'subscription_inactive';
  end if;

  select t.max_clients into v_max
  from public.subscriptions s
  join public.subscription_tiers t on t.id = s.tier_id
  where s.coach_id = new.coach_id
  for update of s;

  if v_max is null then
    return new;
  end if;

  select count(*) into v_count
  from public.clients
  where coach_id = new.coach_id and status <> 'archived' and deleted_at is null;

  if v_count >= v_max then
    raise exception 'Client limit reached for your current plan.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger clients_enforce_cap_on_undelete
  before update of deleted_at on public.clients
  for each row
  when (old.deleted_at is not null and new.deleted_at is null)
  execute function private.enforce_client_cap();

-- ---------------------------------------------------------------------------
-- 7. RPCs: delete, restore, list "recently deleted"
-- ---------------------------------------------------------------------------

-- True when the caller may manage this client: owner of the tenant, or the
-- member the client is assigned to. Ignores deleted_at (both directions use it).
create or replace function private.can_manage_client(p_client_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client_id
      and c.coach_id = (select private.coach_id())
      and (
        (select private.is_team_owner())
        or c.assigned_to = (select auth.uid())
      )
  )
$$;

revoke execute on function private.can_manage_client(uuid) from public;
grant execute on function private.can_manage_client(uuid) to authenticated;

create or replace function public.soft_delete_client(p_client_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.can_manage_client(p_client_id) then
    raise exception 'Client not found.' using errcode = '42501';
  end if;

  update public.clients
  set deleted_at = now()
  where id = p_client_id and deleted_at is null;
end;
$$;

-- Throws (seat cap trigger) when the coach has no free seat, same contract
-- as restoring an archived client.
create or replace function public.restore_client(p_client_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.can_manage_client(p_client_id) then
    raise exception 'Client not found.' using errcode = '42501';
  end if;

  update public.clients
  set deleted_at = null
  where id = p_client_id and deleted_at is not null;
end;
$$;

create or replace function public.list_deleted_clients()
  returns table (
    client_id uuid,
    display_name text,
    email text,
    deleted_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select c.id, c.display_name, c.email, c.deleted_at
  from public.clients c
  where c.deleted_at is not null
    and c.coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or c.assigned_to = (select auth.uid())
    )
  order by c.deleted_at desc
$$;

revoke execute on function public.soft_delete_client(uuid) from public, anon;
revoke execute on function public.restore_client(uuid) from public, anon;
revoke execute on function public.list_deleted_clients() from public, anon;
grant execute on function public.soft_delete_client(uuid) to authenticated;
grant execute on function public.restore_client(uuid) to authenticated;
grant execute on function public.list_deleted_clients() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Permanent deletion after 60 days (pg_cron, daily)
-- ---------------------------------------------------------------------------
-- Deleting the clients row cascades to everything the client owns. The auth
-- user (role 'client' only: never a coach or admin) is deleted alongside it;
-- that's why this runs in the database as the function owner rather than
-- through the client-facing API. One savepoint per client so a single
-- failure can't block the rest of the batch.

create or replace function private.purge_deleted_clients()
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  r record;
  v_purged integer := 0;
begin
  for r in
    select c.id, c.profile_id
    from public.clients c
    where c.deleted_at < now() - interval '60 days'
  loop
    begin
      delete from public.clients where id = r.id;

      if r.profile_id is not null then
        delete from auth.users u
        where u.id = r.profile_id
          and exists (
            select 1 from public.profiles p
            where p.id = u.id and p.role = 'client'
          );
      end if;

      v_purged := v_purged + 1;
    exception when others then
      raise warning 'purge_deleted_clients: client % skipped: %', r.id, sqlerrm;
    end;
  end loop;

  return v_purged;
end;
$$;

revoke execute on function private.purge_deleted_clients() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

-- cron.schedule() with an existing job name replaces that job, so this is
-- safe to re-run.
select cron.schedule(
  'purge-deleted-clients',
  '30 3 * * *',
  $$select private.purge_deleted_clients()$$
);
