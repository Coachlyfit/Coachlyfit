-- Team task management: the tenant owner assigns tasks to themselves or to
-- accepted team members and follows them to done. Gated by the
-- task_management plan flag (20261020000001).
--
-- Who can do what:
--   owner     everything on the tenant's tasks
--   member    sees only tasks assigned to them; changes their status; comments
--   client    nothing (private.coach_id() is null for them)
--   admin     nothing, same boundary as clients / programs / check-ins
--
-- Unlike the other plan flags, this one gates reads too: the flag check is
-- inside every policy, so on a plan without it the tasks are hidden, not
-- deleted, and come back on upgrade.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 5000),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date,
  -- A profile, not a team_members row: the owner can be the assignee and has
  -- no team_members row. Same shape as coaching_decisions.decided_by.
  assignee_id uuid references public.profiles (id) on delete set null,
  -- When the current assignee got the task. Reset on reassignment, so the
  -- productivity numbers measure the person who actually did it.
  assigned_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  client_id uuid references public.clients (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_coach_status_idx on public.tasks (coach_id, status);
create index tasks_assignee_assigned_idx on public.tasks (assignee_id, assigned_at);
create index tasks_client_id_idx on public.tasks (client_id) where client_id is not null;

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index task_comments_task_idx on public.task_comments (task_id, created_at);

-- Everything RLS can't express about a task row:
--   * a team member may change status and nothing else (RLS has no column
--     rules, and column grants can't tell the owner from a member);
--   * the assignee and the linked client must belong to the same tenant;
--   * assigned_at / completed_at / updated_at are derived here, never taken
--     from the caller, so the productivity numbers can't be edited.
-- A null auth.uid() is the service role or a cascade: not a member, so the
-- column rule doesn't apply to it.
create function private.tasks_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'UPDATE' then
    if new.coach_id is distinct from old.coach_id then
      raise exception 'A task cannot move to another tenant.' using errcode = '42501';
    end if;

    if v_uid is not null and v_uid <> old.coach_id and
       (new.title, new.description, new.priority, new.due_date, new.assignee_id, new.client_id, new.created_by)
       is distinct from
       (old.title, old.description, old.priority, old.due_date, old.assignee_id, old.client_id, old.created_by) then
      raise exception 'Team members can only change a task''s status.' using errcode = '42501';
    end if;

    new.created_at := old.created_at;
    new.assigned_at := old.assigned_at;
    new.completed_at := old.completed_at;
  else
    new.created_by := coalesce(v_uid, new.created_by);
    new.assigned_at := null;
    new.completed_at := null;
  end if;

  if tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id then
    if new.assignee_id is not null
       and new.assignee_id <> new.coach_id
       and not exists (
         select 1 from public.team_members tm
         where tm.coach_id = new.coach_id
           and tm.profile_id = new.assignee_id
           and tm.accepted_at is not null
       ) then
      raise exception 'The assignee is not on this team.'
        using errcode = '23514', hint = 'invalid_assignee';
    end if;
    new.assigned_at := case when new.assignee_id is null then null else now() end;
  end if;

  if new.client_id is not null and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id) then
    if not exists (
      select 1 from public.clients c where c.id = new.client_id and c.coach_id = new.coach_id
    ) then
      raise exception 'The client does not belong to this coach.'
        using errcode = '23514', hint = 'invalid_client';
    end if;
  end if;

  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_guard
  before insert or update on public.tasks
  for each row execute function private.tasks_guard();

-- The policies below already refuse the insert; this only turns that bare
-- 42501 into the 'upgrade_required' hint the server actions map to a prompt.
create trigger tasks_require_feature
  before insert on public.tasks
  for each row execute function private.require_feature('task_management');

-- A removed member's open tasks go back to unassigned so the owner sees them
-- need a new home. Finished ones keep the assignee: that is history.
create function private.unassign_removed_member_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.profile_id is not null then
    update public.tasks
    set assignee_id = null
    where coach_id = old.coach_id
      and assignee_id = old.profile_id
      and status in ('todo', 'in_progress');
  end if;
  return old;
end;
$$;

create trigger team_members_unassign_tasks
  after delete on public.team_members
  for each row execute function private.unassign_removed_member_tasks();

-- Policies call it, so it needs the same grant private.coach_has_access has.
-- It only answers yes/no for a coach id.
grant execute on function private.coach_has_feature(uuid, text) to authenticated;

alter table public.tasks enable row level security;

-- coach_id references coaches(id), so coach_id = auth.uid() only ever matches
-- the tenant owner -- the same owner test subscription_requests uses.
create policy owner_all on public.tasks
  for all to authenticated
  using (
    coach_id = (select auth.uid())
    and (select private.coach_has_feature((select auth.uid()), 'task_management'))
  )
  with check (
    coach_id = (select auth.uid())
    and (select private.coach_has_feature((select auth.uid()), 'task_management'))
  );

-- coach_id = private.coach_id() is what makes a removed member lose access:
-- the helper stops resolving for them even while old rows still name them.
create policy assignee_read on public.tasks
  for select to authenticated
  using (
    assignee_id = (select auth.uid())
    and coach_id = (select private.coach_id())
    and (select private.coach_has_feature((select private.coach_id()), 'task_management'))
  );

-- The with check keeps assignee_id on the caller, so a member can't hand a
-- task to someone else; private.tasks_guard() limits them to status.
create policy assignee_update on public.tasks
  for update to authenticated
  using (
    assignee_id = (select auth.uid())
    and coach_id = (select private.coach_id())
    and (select private.coach_has_feature((select private.coach_id()), 'task_management'))
  )
  with check (
    assignee_id = (select auth.uid())
    and coach_id = (select private.coach_id())
  );

grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.tasks to service_role;

alter table public.task_comments enable row level security;

-- The subquery runs under the caller's own tasks policies, so a comment is
-- visible exactly when its task is: no second copy of the rules to drift.
create policy task_visible_read on public.task_comments
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

create policy task_visible_insert on public.task_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id)
  );

create policy author_delete on public.task_comments
  for delete to authenticated
  using (author_id = (select auth.uid()));

grant select, insert, delete on public.task_comments to authenticated;
grant select, insert, update, delete on public.task_comments to service_role;

-- Names for the assignee picker, task rows and comment authors. profiles is
-- self-read only, and a policy opening it to the tenant would expose every
-- column; this returns just a display name for the caller's own team: the
-- owner plus accepted members.
create function public.get_team_directory()
returns table (profile_id uuid, display_name text, is_owner boolean)
language sql
security definer
stable
set search_path = ''
as $$
  select p.id, coalesce(nullif(p.full_name, ''), c.business_name), true
  from public.coaches c
  join public.profiles p on p.id = c.id
  where c.id = (select private.coach_id())
  union all
  select p.id, coalesce(nullif(p.full_name, ''), tm.email), false
  from public.team_members tm
  join public.profiles p on p.id = tm.profile_id
  where tm.coach_id = (select private.coach_id())
    and tm.accepted_at is not null;
$$;

revoke execute on function public.get_team_directory() from public, anon;
grant execute on function public.get_team_directory() to authenticated;
