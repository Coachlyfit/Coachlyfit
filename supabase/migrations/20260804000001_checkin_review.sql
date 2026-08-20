-- Coach review of a client's weekly check-in: a decision (keep the program /
-- adjust it / needs a call), which adjustments were applied, and the reply
-- sent back. Never edits to the client's own answers — same coach_read /
-- client_own split as the rest of this table (20260731000009_progress.sql):
-- "a coach editing a client's self-reported check-in would be misleading
-- data" applies just as much to adding a review on top of it by hand.
alter table public.checkins
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.coaches (id) on delete set null,
  add column decision text check (decision in ('keep', 'adjust', 'call')),
  add column adjustments jsonb,
  add column coach_reply text;

-- Which pose a progress photo is: front/side/back, so the review console's
-- week-over-week comparison and the client's own photo grid can group by
-- pose instead of just date. Nullable — existing rows and any upload flow
-- that doesn't collect a pose still validate.
alter table public.media
  add column pose text check (pose in ('front', 'side', 'back'));

-- The coach has no UPDATE grant on checkins at all (only the coach_read
-- SELECT policy from 20260731000009_progress.sql) — RLS is row-scoped, not
-- column-scoped, so "the coach may only ever touch the review columns" can't
-- be expressed as a policy. This function is the only write path, same
-- shape as admin_promote_exercise/_food in 20260801000015_library_source.sql:
-- explicit role check, then an ownership-scoped UPDATE naming exactly the
-- columns it's allowed to touch.
create function public.review_checkin(
  p_checkin_id uuid,
  p_decision text,
  p_adjustments jsonb default null,
  p_coach_reply text default null
)
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

  if p_decision not in ('keep', 'adjust', 'call') then
    raise exception 'Invalid decision.' using errcode = '22023';
  end if;

  update public.checkins
  set reviewed_at = now(),
      reviewed_by = (select private.coach_id()),
      decision = p_decision,
      adjustments = p_adjustments,
      coach_reply = p_coach_reply
  where id = p_checkin_id
    and coach_id = (select private.coach_id())
  returning * into v_row;

  if not found then
    raise exception 'Check-in not found.' using errcode = '22023';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.review_checkin(uuid, text, jsonb, text) from public;
grant execute on function public.review_checkin(uuid, text, jsonb, text) to authenticated;
