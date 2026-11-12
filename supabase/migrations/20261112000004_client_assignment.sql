-- =============================================================================
-- Client assignment: team members see only assigned clients
-- =============================================================================
-- Schema:  clients.assigned_to, created_by on 16 content tables
-- Helpers: is_team_owner, accessible_client_ids, can_access_client
--          + updated relationship helpers
-- Triggers: clients_assignment_guard, unassign_removed_member_clients,
--           stamp_created_by on all content roots/children
-- Policies: clients, invites, coaching_relationships, 16 content tables,
--           exercises/foods/recipes/form_templates, storage, program_revisions
-- RPCs:    list_online_users, issue_invoice (updated)
-- View:    coach_client_roster (updated)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. SCHEMA ADDITIONS
-- ---------------------------------------------------------------------------

-- clients.assigned_to
alter table public.clients
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

create index if not exists clients_assigned_to_idx
  on public.clients(assigned_to) where assigned_to is not null;

-- created_by on content root tables
alter table public.exercises        add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.foods            add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.recipes          add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.form_templates   add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.programs         add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.diet_plans       add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.rehab_protocols  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- created_by on content child tables
alter table public.recipe_ingredients     add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.form_template_versions add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.program_days           add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.program_items          add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.program_item_sets      add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.program_activities     add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.meals                  add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.meal_items             add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.rehab_phases           add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. BACKFILL created_by = coach_id for existing rows
-- ---------------------------------------------------------------------------

update public.exercises       set created_by = coach_id where created_by is null;
update public.foods            set created_by = coach_id where created_by is null;
update public.recipes          set created_by = coach_id where created_by is null;
update public.form_templates   set created_by = coach_id where created_by is null;
update public.programs         set created_by = coach_id where created_by is null;
update public.diet_plans       set created_by = coach_id where created_by is null;
update public.rehab_protocols  set created_by = coach_id where created_by is null;

-- children: inherit from parent
update public.recipe_ingredients ri
  set created_by = r.created_by
  from public.recipes r where r.id = ri.recipe_id and ri.created_by is null;

update public.form_template_versions ftv
  set created_by = ft.created_by
  from public.form_templates ft where ft.id = ftv.template_id and ftv.created_by is null;

update public.program_days pd
  set created_by = p.created_by
  from public.programs p where p.id = pd.program_id and pd.created_by is null;

update public.program_items pi
  set created_by = pd.created_by
  from public.program_days pd where pd.id = pi.program_day_id and pi.created_by is null;

update public.program_item_sets ps
  set created_by = pi.created_by
  from public.program_items pi where pi.id = ps.program_item_id and ps.created_by is null;

update public.program_activities pa
  set created_by = pd.created_by
  from public.program_days pd where pd.id = pa.program_day_id and pa.created_by is null;

update public.meals m
  set created_by = dp.created_by
  from public.diet_plans dp where dp.id = m.diet_plan_id and m.created_by is null;

update public.meal_items mi
  set created_by = m.created_by
  from public.meals m where m.id = mi.meal_id and mi.created_by is null;

update public.rehab_phases rph
  set created_by = rp.created_by
  from public.rehab_protocols rp where rp.id = rph.protocol_id and rph.created_by is null;

-- ---------------------------------------------------------------------------
-- 3. HELPER FUNCTIONS
-- ---------------------------------------------------------------------------

-- is_team_owner(): true iff the caller is the tenant owner (not a member)
create or replace function private.is_team_owner()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce((select private.coach_id()) = (select auth.uid()), false)
$$;

grant execute on function private.is_team_owner() to authenticated;

-- accessible_client_ids(): clients the caller may see
-- owner → all tenant clients; member → only assigned ones
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
    and (
      (select private.is_team_owner())
      or c.assigned_to = (select auth.uid())
    )
$$;

grant execute on function private.accessible_client_ids() to authenticated;

-- can_access_client(uuid): quick boolean check
create or replace function private.can_access_client(p_client_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select p_client_id in (select private.accessible_client_ids())
$$;

grant execute on function private.can_access_client(uuid) to authenticated;

-- Update the 4 relationship helpers to filter by assignment
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
-- 4. TRIGGER: stamp_created_by
-- ---------------------------------------------------------------------------
-- Generic: on INSERT sets created_by from parent (child tables) or auth.uid()
-- (roots). On UPDATE keeps old.created_by.
-- For child tables: tg_argv[0] = parent table, tg_argv[1] = fk column.
-- ---------------------------------------------------------------------------

-- Root trigger: set created_by = auth.uid() on insert; freeze on update
create or replace function private.stamp_created_by_root()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    return new;
  end if;
  -- INSERT
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end;
$$;

-- Child trigger functions: inherit created_by from parent; freeze on update
create or replace function private.stamp_created_by_recipe_ingredients()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.created_by := old.created_by; return new; end if;
  select created_by into new.created_by from public.recipes where id = new.recipe_id;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create or replace function private.stamp_created_by_form_template_versions()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.created_by := old.created_by; return new; end if;
  select created_by into new.created_by from public.form_templates where id = new.template_id;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create or replace function private.stamp_created_by_program_days()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.created_by := old.created_by; return new; end if;
  select created_by into new.created_by from public.programs where id = new.program_id;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create or replace function private.stamp_created_by_program_items()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.created_by := old.created_by; return new; end if;
  select created_by into new.created_by from public.program_days where id = new.program_day_id;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create or replace function private.stamp_created_by_program_item_sets()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.created_by := old.created_by; return new; end if;
  select created_by into new.created_by from public.program_items where id = new.program_item_id;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create or replace function private.stamp_created_by_program_activities()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.created_by := old.created_by; return new; end if;
  select created_by into new.created_by from public.program_days where id = new.program_day_id;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create or replace function private.stamp_created_by_meals()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.created_by := old.created_by; return new; end if;
  select created_by into new.created_by from public.diet_plans where id = new.diet_plan_id;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create or replace function private.stamp_created_by_meal_items()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.created_by := old.created_by; return new; end if;
  select created_by into new.created_by from public.meals where id = new.meal_id;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create or replace function private.stamp_created_by_rehab_phases()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.created_by := old.created_by; return new; end if;
  select created_by into new.created_by from public.rehab_protocols where id = new.protocol_id;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

-- Wire up root tables
create or replace trigger stamp_created_by
  before insert or update on public.exercises
  for each row execute function private.stamp_created_by_root();

create or replace trigger stamp_created_by
  before insert or update on public.foods
  for each row execute function private.stamp_created_by_root();

create or replace trigger stamp_created_by
  before insert or update on public.recipes
  for each row execute function private.stamp_created_by_root();

create or replace trigger stamp_created_by
  before insert or update on public.form_templates
  for each row execute function private.stamp_created_by_root();

create or replace trigger stamp_created_by
  before insert or update on public.programs
  for each row execute function private.stamp_created_by_root();

create or replace trigger stamp_created_by
  before insert or update on public.diet_plans
  for each row execute function private.stamp_created_by_root();

create or replace trigger stamp_created_by
  before insert or update on public.rehab_protocols
  for each row execute function private.stamp_created_by_root();

-- Wire up child tables
create or replace trigger stamp_created_by
  before insert or update on public.recipe_ingredients
  for each row execute function private.stamp_created_by_recipe_ingredients();

create or replace trigger stamp_created_by
  before insert or update on public.form_template_versions
  for each row execute function private.stamp_created_by_form_template_versions();

create or replace trigger stamp_created_by
  before insert or update on public.program_days
  for each row execute function private.stamp_created_by_program_days();

create or replace trigger stamp_created_by
  before insert or update on public.program_items
  for each row execute function private.stamp_created_by_program_items();

create or replace trigger stamp_created_by
  before insert or update on public.program_item_sets
  for each row execute function private.stamp_created_by_program_item_sets();

create or replace trigger stamp_created_by
  before insert or update on public.program_activities
  for each row execute function private.stamp_created_by_program_activities();

create or replace trigger stamp_created_by
  before insert or update on public.meals
  for each row execute function private.stamp_created_by_meals();

create or replace trigger stamp_created_by
  before insert or update on public.meal_items
  for each row execute function private.stamp_created_by_meal_items();

create or replace trigger stamp_created_by
  before insert or update on public.rehab_phases
  for each row execute function private.stamp_created_by_rehab_phases();

-- ---------------------------------------------------------------------------
-- 5. TRIGGER: clients_assignment_guard
-- ---------------------------------------------------------------------------

create or replace function private.clients_assignment_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_is_owner boolean := (select private.is_team_owner());
begin
  -- member creating a client → auto-assign to themselves
  if tg_op = 'INSERT' and not v_is_owner then
    new.assigned_to := auth.uid();
  end if;

  -- coach_id changed → clear assignment
  if tg_op = 'UPDATE' and new.coach_id is distinct from old.coach_id then
    new.assigned_to := null;
    return new;
  end if;

  -- non-owner trying to change assignment → block
  if tg_op = 'UPDATE'
    and new.assigned_to is distinct from old.assigned_to
    and not v_is_owner
  then
    raise exception 'Only the account owner can change client assignments.'
      using errcode = '42501', hint = 'owner_only';
  end if;

  -- validate assignee: must be null or an accepted team member
  if new.assigned_to is not null then
    if not exists (
      select 1 from public.team_members
      where coach_id = new.coach_id
        and profile_id = new.assigned_to
        and accepted_at is not null
    ) then
      raise exception 'Assignee is not an accepted team member of this tenant.'
        using errcode = '23514', hint = 'invalid_assignee';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists clients_assignment_guard on public.clients;
create trigger clients_assignment_guard
  before insert or update on public.clients
  for each row execute function private.clients_assignment_guard();

-- ---------------------------------------------------------------------------
-- 6. TRIGGER: unassign_removed_member_clients
-- ---------------------------------------------------------------------------

create or replace function private.unassign_removed_member_clients()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.clients
  set assigned_to = null
  where coach_id = old.coach_id
    and assigned_to = old.profile_id;
  return old;
end;
$$;

drop trigger if exists team_members_unassign_clients on public.team_members;
create trigger team_members_unassign_clients
  after delete on public.team_members
  for each row execute function private.unassign_removed_member_clients();

-- ---------------------------------------------------------------------------
-- 7. POLICIES
-- ---------------------------------------------------------------------------

-- 7a. clients.coach_rw: scope to accessible clients
drop policy if exists coach_rw on public.clients;
create policy coach_rw on public.clients
  for all to authenticated
  using (
    coach_id = (select private.coach_id())
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

-- 7b. invites.coach_rw: scope to accessible clients
drop policy if exists coach_rw on public.invites;
create policy coach_rw on public.invites
  for all to authenticated
  using (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or client_id in (select private.accessible_client_ids())
    )
  )
  with check (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or client_id in (select private.accessible_client_ids())
    )
  );

-- 7c. coaching_relationships.coach_read_own
drop policy if exists coach_read_own on public.coaching_relationships;
create policy coach_read_own on public.coaching_relationships
  for select to authenticated
  using (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or client_id in (select private.accessible_client_ids())
    )
  );

-- 7d. program_revisions.coach_rw: scope via programs RLS
drop policy if exists coach_rw on public.program_revisions;
create policy coach_rw on public.program_revisions
  for all to authenticated
  using (
    coach_id = (select private.coach_id())
    and program_id in (select id from public.programs)
  )
  with check (
    coach_id = (select private.coach_id())
    and program_id in (select id from public.programs)
  );

-- 7e. coach_read_own SELECT on 15 tables: add accessible_client_ids filter
--     (coaching_relationships handled above)
--     Tables with nullable client_id (content): allow nulls (templates)
--     Tables with NOT NULL client_id (billing/assignments): no null branch

-- client-scoped only (NOT NULL client_id):
-- client_observations, client_subscriptions, client_transactions,
-- coaching_decisions, form_assignments, invoices

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
          and (
            (select private.is_team_owner())
            or client_id in (select private.accessible_client_ids())
          )
        )
    $p$, t);
  end loop;
end;
$$;

-- content tables (nullable client_id): templates readable by all members
do $$
declare
  t text;
begin
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

-- 7f. coach_rw on content tables: null branch (templates) restricted to creator
--     client-scoped branch uses accessible_client_ids (already in helper)

-- client_observations, client_subscriptions, client_transactions,
-- coaching_decisions, form_assignments, invoices (NOT NULL client_id):
-- already gated by coach_rw using active_client_ids() which now filters by assignment.
-- No change needed here: active_client_ids() is now assignment-aware.

-- content tables with nullable client_id: restrict template writes to owner-or-creator
do $$
declare
  t text;
begin
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
    execute format('drop policy if exists coach_rw on public.%I', t);
    execute format($p$
      create policy coach_rw on public.%I
        for all to authenticated
        using (
          coach_id = (select private.coach_id())
          and (
            (client_id is null and (
              (select private.is_team_owner())
              or created_by = (select auth.uid())
            ))
            or (client_id is not null and client_id in (select private.active_client_ids()))
          )
        )
        with check (
          coach_id = (select private.coach_id())
          and (
            (client_id is null and (
              (select private.is_team_owner())
              or created_by = (select auth.uid())
            ))
            or (client_id is not null and client_id in (select private.active_client_ids()))
          )
        )
    $p$, t);
  end loop;
end;
$$;

-- invoices special with_check (keeps transaction_id cross-check)
drop policy if exists coach_rw on public.invoices;
create policy coach_rw on public.invoices
  for all to authenticated
  using (
    coach_id = (select private.coach_id())
    and client_id in (select private.active_client_ids())
  )
  with check (
    coach_id = (select private.coach_id())
    and client_id in (select private.active_client_ids())
    and (transaction_id is null or exists (
      select 1 from public.client_transactions t
      where t.id = invoices.transaction_id
        and t.client_id = invoices.client_id
    ))
  );

-- 7g. exercises / foods: update_own and delete_own → owner-or-creator
drop policy if exists update_own on public.exercises;
create policy update_own on public.exercises
  for update to authenticated
  using (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or created_by = (select auth.uid())
    )
  )
  with check (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or created_by = (select auth.uid())
    )
  );

drop policy if exists delete_own on public.exercises;
create policy delete_own on public.exercises
  for delete to authenticated
  using (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or created_by = (select auth.uid())
    )
  );

drop policy if exists update_own on public.foods;
create policy update_own on public.foods
  for update to authenticated
  using (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or created_by = (select auth.uid())
    )
  )
  with check (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or created_by = (select auth.uid())
    )
  );

drop policy if exists delete_own on public.foods;
create policy delete_own on public.foods
  for delete to authenticated
  using (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or created_by = (select auth.uid())
    )
  );

-- 7h. form_templates.coach_write, form_template_versions.coach_insert
drop policy if exists coach_write on public.form_templates;
create policy coach_write on public.form_templates
  for all to authenticated
  using (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or created_by = (select auth.uid())
    )
  )
  with check (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or created_by = (select auth.uid())
    )
  );

drop policy if exists coach_insert on public.form_template_versions;
create policy coach_insert on public.form_template_versions
  for insert to authenticated
  with check (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or created_by = (select auth.uid())
    )
  );

-- 7i. recipes: split into coach_read (all tenant) + coach_rw (owner-or-creator)
drop policy if exists coach_rw on public.recipes;

create policy coach_read on public.recipes
  for select to authenticated
  using (coach_id = (select private.coach_id()));

create policy coach_rw on public.recipes
  for all to authenticated
  using (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or created_by = (select auth.uid())
    )
  )
  with check (
    coach_id = (select private.coach_id())
    and (
      (select private.is_team_owner())
      or created_by = (select auth.uid())
    )
  );

-- 7j. recipe_ingredients: split into coach_read + coach_rw
drop policy if exists coach_rw on public.recipe_ingredients;

create policy coach_read on public.recipe_ingredients
  for select to authenticated
  using (
    recipe_id in (
      select r.id from public.recipes r
      where r.coach_id = (select private.coach_id())
    )
  );

create policy coach_rw on public.recipe_ingredients
  for all to authenticated
  using (
    recipe_id in (
      select r.id from public.recipes r
      where r.coach_id = (select private.coach_id())
        and (
          (select private.is_team_owner())
          or r.created_by = (select auth.uid())
        )
    )
    and food_id in (select f.id from public.foods f)
  )
  with check (
    recipe_id in (
      select r.id from public.recipes r
      where r.coach_id = (select private.coach_id())
        and (
          (select private.is_team_owner())
          or r.created_by = (select auth.uid())
        )
    )
    and food_id in (select f.id from public.foods f)
  );

-- 7k. client_packages, client_payment_methods:
--     coach_read (all tenant members) + coach_rw (owner only, finance config)
drop policy if exists coach_rw on public.client_packages;

create policy coach_read on public.client_packages
  for select to authenticated
  using (coach_id = (select private.coach_id()));

create policy coach_rw on public.client_packages
  for all to authenticated
  using (
    coach_id = (select private.coach_id())
    and (select private.is_team_owner())
  )
  with check (
    coach_id = (select private.coach_id())
    and (select private.is_team_owner())
  );

drop policy if exists coach_rw on public.client_payment_methods;

create policy coach_read on public.client_payment_methods
  for select to authenticated
  using (coach_id = (select private.coach_id()));

create policy coach_rw on public.client_payment_methods
  for all to authenticated
  using (
    coach_id = (select private.coach_id())
    and (select private.is_team_owner())
  )
  with check (
    coach_id = (select private.coach_id())
    and (select private.is_team_owner())
  );

-- ---------------------------------------------------------------------------
-- 8. STORAGE POLICIES
-- ---------------------------------------------------------------------------

-- observation-images: add accessible_client_ids filter on select
drop policy if exists observation_images_coach_select on storage.objects;
create policy observation_images_coach_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'observation-images'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
    and (
      (select private.is_team_owner())
      or (storage.foldername(name))[2] in (
        select id::text from public.clients
        where coach_id = (select private.coach_id())
          and assigned_to = (select auth.uid())
      )
    )
  );

-- payment-proofs: add assignment filter
drop policy if exists payment_proofs_coach_select on storage.objects;
create policy payment_proofs_coach_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
    and (
      (select private.is_team_owner())
      or (storage.foldername(name))[2] in (
        select id::text from public.clients
        where coach_id = (select private.coach_id())
          and assigned_to = (select auth.uid())
      )
    )
  );

drop policy if exists payment_proofs_coach_insert on storage.objects;
create policy payment_proofs_coach_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
    and (
      (select private.is_team_owner())
      or (storage.foldername(name))[2] in (
        select id::text from public.clients
        where coach_id = (select private.coach_id())
          and assigned_to = (select auth.uid())
      )
    )
  );

drop policy if exists payment_proofs_coach_delete on storage.objects;
create policy payment_proofs_coach_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
    and (
      (select private.is_team_owner())
      or (storage.foldername(name))[2] in (
        select id::text from public.clients
        where coach_id = (select private.coach_id())
          and assigned_to = (select auth.uid())
      )
    )
  );

-- progress-media: add assignment filter on insert
drop policy if exists progress_media_coach_insert on storage.objects;
create policy progress_media_coach_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'progress-media'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
    and (
      (select private.is_team_owner())
      or (storage.foldername(name))[2] in (
        select id::text from public.clients
        where coach_id = (select private.coach_id())
          and assigned_to = (select auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 9. RPCs (create or replace with updated bodies)
-- ---------------------------------------------------------------------------

-- list_online_users: filter clients by assignment for members
create or replace function public.list_online_users(
  p_search  text    default null,
  p_limit   integer default 50,
  p_offset  integer default 0
)
  returns table(
    user_id       uuid,
    name          text,
    avatar_url    text,
    role          user_role,
    coach_id      uuid,
    coach_name    text,
    last_seen_at  timestamptz,
    online        boolean,
    total_count   bigint,
    online_count  bigint
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_is_admin  boolean := private.is_admin();
  v_coach_id  uuid    := private.coach_id();
begin
  if not v_is_admin and v_coach_id is null then
    raise exception 'Coach or admin only.' using errcode = '42501';
  end if;

  return query
    with base as (
      select
        p.id              as r_user_id,
        coalesce(cl.display_name, p.full_name) as r_name,
        p.avatar_url      as r_avatar_url,
        p.role            as r_role,
        cl.coach_id       as r_coach_id,
        coachp.full_name  as r_coach_name,
        p.last_seen_at    as r_last_seen_at
      from public.clients cl
      join public.profiles p     on p.id = cl.profile_id
      left join public.profiles coachp on coachp.id = cl.coach_id
      where cl.status <> 'archived'
        and (
          v_is_admin
          or (
            cl.coach_id = v_coach_id
            and (
              v_coach_id = (select auth.uid())   -- owner
              or cl.assigned_to = (select auth.uid())  -- member
            )
          )
        )

      union all

      select
        c.id             as r_user_id,
        p.full_name      as r_name,
        p.avatar_url     as r_avatar_url,
        p.role           as r_role,
        c.id             as r_coach_id,
        p.full_name      as r_coach_name,
        p.last_seen_at   as r_last_seen_at
      from public.coaches c
      join public.profiles p on p.id = c.id
      where v_is_admin
    ),
    filtered as (
      select * from base
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
        where r_last_seen_at is not null
          and r_last_seen_at >= now() - interval '5 minutes'
      ) over ()
    from filtered
    order by
      (r_last_seen_at is not null and r_last_seen_at >= now() - interval '5 minutes') desc,
      r_last_seen_at desc nulls last,
      r_name
    limit p_limit offset p_offset;
end;
$$;

-- issue_invoice: add accessible_client_ids check for members
create or replace function public.issue_invoice(p_invoice_id uuid)
  returns public.invoices
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_coach   public.coaches;
  v_client  public.clients;
  v_n       int;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;

  if v_invoice.id is null
    or v_invoice.coach_id is distinct from (select private.coach_id())
  then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;

  -- member must have this client assigned
  if not (select private.is_team_owner())
    and v_invoice.client_id not in (select private.active_client_ids())
  then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'Only a draft can be issued.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.invoice_items where invoice_id = p_invoice_id
  ) then
    raise exception 'An invoice needs at least one item before it can be issued.'
      using errcode = '22023';
  end if;

  insert into public.invoice_counters (coach_id, last_number)
  values (v_invoice.coach_id, 1)
  on conflict (coach_id) do update
    set last_number = public.invoice_counters.last_number + 1
  returning last_number into v_n;

  select * into v_coach from public.coaches where id = v_invoice.coach_id;
  select * into v_client from public.clients where id = v_invoice.client_id;

  update public.invoices
  set
    status         = 'issued',
    invoice_number = 'INV-' || lpad(v_n::text, greatest(4, length(v_n::text)), '0'),
    issue_date     = coalesce(issue_date, current_date),
    snapshot       = jsonb_build_object(
      'seller', jsonb_build_object(
        'business_name', v_coach.business_name,
        'logo_path',     v_coach.logo_path,
        'address',       v_coach.address,
        'tax_number',    v_coach.tax_number,
        'contact_phone', v_coach.contact_phone,
        'contact_email', v_coach.contact_email
      ),
      'client', jsonb_build_object(
        'display_name', v_client.display_name,
        'email',        v_client.email,
        'phone',        v_client.phone
      )
    )
  where id = p_invoice_id
  returning * into v_invoice;

  return v_invoice;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. VIEW: coach_client_roster (add assigned_to)
-- ---------------------------------------------------------------------------

create or replace view public.coach_client_roster
  with (security_invoker = true)
as
select
  c.id              as client_id,
  c.coach_id,
  c.display_name,
  c.email,
  c.status,
  c.created_at,
  c.assigned_to,
  k.last_checkin_date,
  k.adherence,
  p.id              as program_id,
  p.name_ar         as program_name_ar,
  p.name_en         as program_name_en,
  s.status          as subscription_status,
  s.end_date        as subscription_end_date,
  prof.avatar_url
from public.clients c
left join public.profiles prof on prof.id = c.profile_id
left join lateral (
  select
    max(ch.checkin_date) as last_checkin_date,
    (round(avg(ch.adherence) filter (where ch.checkin_date >= current_date - 90)))::integer as adherence
  from public.checkins ch
  where ch.client_id = c.id
) k on true
left join lateral (
  select pr.id, pr.name_ar, pr.name_en
  from public.programs pr
  where pr.client_id = c.id and pr.archived_at is null
  order by pr.created_at desc
  limit 1
) p on true
left join lateral (
  select cs.status, cs.end_date
  from public.client_subscriptions cs
  where cs.client_id = c.id
  order by cs.created_at desc
  limit 1
) s on true;
