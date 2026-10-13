-- Support notifications, as ordinary notifications rows: they show in the
-- bell and go out through the existing email / push delivery queue
-- (private.queue_notification_deliveries), honouring each person's settings.
-- One kind per recipient side, so each has one copy and one link:
--
--   support_ticket_created   to every admin   a coach opened a ticket
--   support_coach_reply      to every admin   a coach replied
--   support_ticket_reopened  to every admin   a coach reopened a ticket
--   support_admin_reply      to the coach     an admin replied
--   support_status_changed   to the coach     an admin changed the status
--
-- An internal note notifies nobody. Same shape as private.notify_on_task
-- (20261020000004).
create function private.notify_on_ticket_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.support_tickets;
  v_name text;
  v_first boolean;
begin
  if new.is_internal then
    return new;
  end if;

  select * into v_ticket from public.support_tickets where id = new.ticket_id;

  if new.sender_role = 'admin' then
    insert into public.notifications (profile_id, kind, payload)
    values (
      v_ticket.coach_id,
      'support_admin_reply',
      jsonb_build_object('ticket_id', v_ticket.id, 'subject', v_ticket.subject)
    );
    return new;
  end if;

  select business_name into v_name from public.coaches where id = v_ticket.coach_id;
  v_first := not exists (
    select 1 from public.ticket_messages m where m.ticket_id = new.ticket_id and m.id <> new.id
  );

  insert into public.notifications (profile_id, kind, payload)
  select
    p.id,
    case when v_first then 'support_ticket_created' else 'support_coach_reply' end,
    jsonb_build_object('ticket_id', v_ticket.id, 'subject', v_ticket.subject, 'name', v_name)
  from public.profiles p
  where p.role = 'admin';

  return new;
end;
$$;

create trigger ticket_messages_notify
  after insert on public.ticket_messages
  for each row execute function private.notify_on_ticket_message();

-- pg_trigger_depth() = 1 means a status change someone asked for. The
-- automatic move after a reply (private.ticket_messages_after_insert) arrives
-- at depth 2 and is already announced by the reply's own notification.
create function private.notify_on_ticket_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if new.status is not distinct from old.status or pg_trigger_depth() > 1 then
    return new;
  end if;

  if private.is_admin() then
    insert into public.notifications (profile_id, kind, payload)
    values (
      new.coach_id,
      'support_status_changed',
      jsonb_build_object('ticket_id', new.id, 'subject', new.subject, 'status', new.status)
    );
  elsif (select auth.uid()) = new.coach_id then
    -- The only status change a coach can make is support_reopen_ticket().
    select business_name into v_name from public.coaches where id = new.coach_id;

    insert into public.notifications (profile_id, kind, payload)
    select
      p.id,
      'support_ticket_reopened',
      jsonb_build_object('ticket_id', new.id, 'subject', new.subject, 'name', v_name)
    from public.profiles p
    where p.role = 'admin';
  end if;

  return new;
end;
$$;

create trigger support_tickets_notify_status
  after update on public.support_tickets
  for each row execute function private.notify_on_ticket_status();
