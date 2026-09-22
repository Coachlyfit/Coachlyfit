-- ---------------------------------------------------------------------------
-- new_message notifications carried only message_id/sender_role, so the bell
-- rendered a generic "you have a new message" with nowhere to click. Add
-- client_id (recipient-side link target, always a coach viewing /inbox/[id])
-- and the sender's display name so the bell can say who and link to the
-- thread.
-- ---------------------------------------------------------------------------
create or replace function private.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_profile_id uuid;
  v_sender_name text;
begin
  if new.sender_role = 'coach' then
    select profile_id into v_recipient_profile_id
    from public.clients where id = new.client_id;
    select business_name into v_sender_name
    from public.coaches where id = new.coach_id;
  else
    v_recipient_profile_id := new.coach_id;
    select display_name into v_sender_name
    from public.clients where id = new.client_id;
  end if;

  if v_recipient_profile_id is not null then
    insert into public.notifications (profile_id, kind, payload)
    values (
      v_recipient_profile_id,
      'new_message',
      jsonb_build_object(
        'message_id', new.id,
        'sender_role', new.sender_role,
        'client_id', new.client_id,
        'sender_name', v_sender_name
      )
    );
  end if;

  return new;
end;
$$;
