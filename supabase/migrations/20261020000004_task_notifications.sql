-- Task notifications, as ordinary notifications rows: they show in the bell
-- and go out through the existing email / push delivery queue
-- (private.queue_notification_deliveries), honouring each person's settings.
--
--   task_assigned   to the assignee, when a task is given to them by someone
--                   else (assigning a task to yourself tells you nothing)
--   task_completed  to the tenant owner, when someone else marks a task done
--
-- Same shape as private.notify_on_message (20260923000002). Due-soon
-- reminders are not here: they need a schedule, not a trigger.
create function private.notify_on_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_name text;
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and new.assignee_id is distinct from v_actor then
    insert into public.notifications (profile_id, kind, payload)
    values (
      new.assignee_id,
      'task_assigned',
      jsonb_build_object('task_id', new.id, 'title', new.title)
    );
  end if;

  if tg_op = 'UPDATE'
     and new.status = 'done'
     and old.status <> 'done'
     and v_actor is distinct from new.coach_id then
    select nullif(full_name, '') into v_actor_name from public.profiles where id = v_actor;

    insert into public.notifications (profile_id, kind, payload)
    values (
      new.coach_id,
      'task_completed',
      jsonb_build_object('task_id', new.id, 'title', new.title, 'name', v_actor_name)
    );
  end if;

  return new;
end;
$$;

create trigger tasks_notify
  after insert or update on public.tasks
  for each row execute function private.notify_on_task();
