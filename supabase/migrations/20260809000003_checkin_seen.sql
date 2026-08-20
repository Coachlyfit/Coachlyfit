-- Read receipt: when the coach opens a check-in in the review console.
-- Same write-path shape as mark_checkin_adjustment_applied (coach has no
-- direct UPDATE grant on checkins) and the same "mark on view, once"
-- semantics as MessagesService.markThreadRead.
alter table public.checkins add column coach_seen_at timestamptz;

create function public.mark_checkin_seen(p_checkin_id uuid)
returns public.checkins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.checkins;
begin
  if (select private.coach_id()) is null then
    raise exception 'Coach only.' using errcode = '42501';
  end if;

  update public.checkins
  set coach_seen_at = coalesce(coach_seen_at, now())
  where id = p_checkin_id
    and coach_id = (select private.coach_id())
  returning * into v_row;

  if not found then
    raise exception 'Check-in not found.' using errcode = '22023';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.mark_checkin_seen(uuid) from public;
grant execute on function public.mark_checkin_seen(uuid) to authenticated;
