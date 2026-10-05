-- Review state for form submissions: the coach home inbox filters on
-- new / reviewed, and until now only checkins carried that (see
-- 20260804000001_checkin_review.sql). Just the marker -- a submission has no
-- decision/adjustments/reply the way a weekly check-in does.
alter table public.form_submissions
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.coaches (id) on delete set null;

-- Everything submitted before this column existed has, as far as the coach
-- is concerned, already been dealt with. Without this the inbox would open
-- with the coach's entire history flagged "new".
update public.form_submissions set reviewed_at = submitted_at;

-- The dashboard's "awaiting review" count and the inbox's "new" filter.
create index form_submissions_unreviewed_idx
  on public.form_submissions (coach_id, submitted_at desc)
  where reviewed_at is null;

-- The coach has no UPDATE grant on form_submissions (select/insert only, see
-- 20260731000007_forms.sql), and RLS can't scope an UPDATE to two columns, so
-- this is the only write path -- same shape and same live-relationship
-- scoping as review_checkin in 20260930000004_coaching_relationships.sql.
-- Idempotent: marking twice keeps the first timestamp and reviewer.
create function public.mark_form_submission_reviewed(p_submission_id uuid)
returns public.form_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.form_submissions;
begin
  if (select private.coach_id()) is null then
    raise exception 'Coach only.' using errcode = '42501';
  end if;

  update public.form_submissions
  set reviewed_at = coalesce(reviewed_at, now()),
      reviewed_by = coalesce(reviewed_by, (select private.coach_id()))
  where id = p_submission_id
    and coach_id = (select private.coach_id())
    and relationship_id in (select private.active_relationship_ids())
  returning * into v_row;

  if not found then
    raise exception 'Submission not found.' using errcode = '22023';
  end if;

  return v_row;
end;
$$;

-- anon too, not just public: Supabase's default privileges grant EXECUTE on
-- new public functions to anon directly (see 20260930000005).
revoke execute on function public.mark_form_submission_reviewed(uuid) from public, anon;
grant execute on function public.mark_form_submission_reviewed(uuid) to authenticated;
