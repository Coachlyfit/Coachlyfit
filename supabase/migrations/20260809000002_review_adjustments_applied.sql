-- Whether a review's structured adjustment has already been turned into a
-- program change, so Program Builder's pending-adjustments banner doesn't
-- re-offer something already applied. Separate from reviewed_at
-- (20260804000001_checkin_review.sql): a coach can review a check-in
-- ("adjust") without immediately applying it to the program.
alter table public.checkins add column adjustment_applied_at timestamptz;

-- Same reasoning and shape as review_checkin: the coach has no direct
-- UPDATE grant on checkins, RLS is row-scoped not column-scoped, so this is
-- the only write path for this one column.
create function public.mark_checkin_adjustment_applied(p_checkin_id uuid)
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
  set adjustment_applied_at = now()
  where id = p_checkin_id
    and coach_id = (select private.coach_id())
  returning * into v_row;

  if not found then
    raise exception 'Check-in not found.' using errcode = '22023';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.mark_checkin_adjustment_applied(uuid) from public;
grant execute on function public.mark_checkin_adjustment_applied(uuid) to authenticated;
