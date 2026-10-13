-- Per-assignee task numbers for the productivity view. One cohort so every
-- column reconciles with the others: tasks whose current assignment started
-- inside the range, cancelled ones left out.
--
--   assigned            the cohort
--   completed           of those, done
--   completed_with_due  done and had a due date (the on-time denominator: a
--                       task with no due date is neither on time nor late)
--   completed_on_time   done on or before the due date
--   overdue             not done and past the due date today
--   avg_completion_seconds  assignment to done, over completed tasks
--
-- Days are Africa/Cairo days, the zone the other date logic uses. assigned_at
-- resets on reassignment (private.tasks_guard), so a task counts for whoever
-- holds it now.
--
-- Security invoker: the tasks policies decide the rows. The owner gets every
-- assignee; a team member could only ever get their own row; another tenant,
-- a client or an admin gets nothing.
create function public.task_productivity(p_from date, p_to date)
returns table (
  assignee_id uuid,
  assigned int,
  completed int,
  completed_with_due int,
  completed_on_time int,
  overdue int,
  avg_completion_seconds double precision
)
language sql
security invoker
stable
set search_path = ''
as $$
  select
    t.assignee_id,
    count(*)::int,
    (count(*) filter (where t.status = 'done'))::int,
    (count(*) filter (where t.status = 'done' and t.due_date is not null))::int,
    (count(*) filter (
      where t.status = 'done'
        and t.due_date is not null
        and (t.completed_at at time zone 'Africa/Cairo')::date <= t.due_date
    ))::int,
    (count(*) filter (
      where t.status <> 'done'
        and t.due_date < (now() at time zone 'Africa/Cairo')::date
    ))::int,
    (extract(epoch from avg(t.completed_at - t.assigned_at) filter (where t.status = 'done')))::double precision
  from public.tasks t
  where t.assignee_id is not null
    and t.status <> 'cancelled'
    and (t.assigned_at at time zone 'Africa/Cairo')::date between p_from and p_to
  group by t.assignee_id;
$$;

revoke execute on function public.task_productivity(date, date) from public, anon;
grant execute on function public.task_productivity(date, date) to authenticated;
