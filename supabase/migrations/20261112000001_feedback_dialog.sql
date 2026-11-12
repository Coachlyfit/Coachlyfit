-- "Send feedback" for coaches AND clients: a kind (bug / feature / rating), an
-- optional star rating, an optional screenshot, and who sent it. Still a
-- write-only box for the submitter: there is no select-own policy, only the
-- insert policy below and admin_read (20260825000001_feedback.sql).

alter table public.feedback
  add column author_id uuid references public.profiles (id) on delete cascade,
  add column author_role text,
  add column author_name text,
  add column kind text,
  add column rating smallint,
  add column screenshot_path text;

-- Old rows were coach-only free text. The tenant owner's id is the best
-- author we have (a team member's own id wasn't stored).
update public.feedback f
set author_id = f.coach_id,
    author_role = 'coach',
    kind = 'feature',
    author_name = (select c.business_name from public.coaches c where c.id = f.coach_id);

alter table public.feedback
  alter column author_id set not null,
  alter column author_role set not null,
  alter column kind set not null,
  -- A client has no coach row; a rating can come without a comment.
  alter column coach_id drop not null,
  alter column body drop not null;

alter table public.feedback drop constraint feedback_body_check;

alter table public.feedback
  add constraint feedback_author_role_check check (author_role in ('coach', 'client')),
  add constraint feedback_kind_check check (kind in ('bug', 'feature', 'rating')),
  add constraint feedback_coach_id_role_check check ((author_role = 'coach') = (coach_id is not null)),
  add constraint feedback_body_check check (body is null or char_length(body) between 1 and 1000),
  add constraint feedback_rating_check check (
    (kind = 'rating') = (rating is not null) and (rating is null or rating between 1 and 5)
  ),
  add constraint feedback_body_required_check check (kind = 'rating' or body is not null);

create index feedback_author_idx on public.feedback (author_id, created_at desc);

-- Runs as the table owner: the submitter can't read feedback, so the rate
-- limit count (and the name lookup, profiles being own-row only) can't run
-- under their own rights.
create function private.feedback_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.feedback
      where author_id = new.author_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too much feedback today.' using errcode = '23514', hint = 'too_many_today';
  end if;

  -- A screenshot lives under author/feedback_id/, so a row can only name its own.
  if new.screenshot_path is not null
     and not starts_with(new.screenshot_path, new.author_id::text || '/' || new.id::text || '/') then
    raise exception 'Screenshot does not belong to this feedback.'
      using errcode = '23514', hint = 'invalid_attachment';
  end if;

  -- A snapshot taken here, not by the caller: admins can't read profiles.
  new.author_name := case
    when new.author_role = 'coach' then coalesce(
      (select c.business_name from public.coaches c where c.id = new.coach_id),
      (select p.full_name from public.profiles p where p.id = new.author_id))
    else (select p.full_name from public.profiles p where p.id = new.author_id)
  end;
  new.created_at := now();

  return new;
end;
$$;

create trigger feedback_guard
  before insert on public.feedback
  for each row execute function private.feedback_guard();

-- ---------------------------------------------------------------------------
-- RLS. A coach writes for their tenant (a team member for the owner's), a
-- client writes with no coach. author_id is always the caller.

drop policy coach_insert on public.feedback;

create policy submitter_insert on public.feedback
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (author_role = 'coach' and coach_id = (select private.coach_id()))
      or (author_role = 'client' and coach_id is null and (select private.client_id()) is not null)
    )
  );

revoke all on public.feedback from anon, authenticated;
grant select, insert on public.feedback to authenticated;

-- ---------------------------------------------------------------------------
-- Storage. Private bucket, path author_id/feedback_id/file. Insert-only for the
-- owner's own folder, read for admins only; no update or delete policy.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-attachments', 'feedback-attachments', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']);

create policy feedback_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'feedback-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and ((select private.coach_id()) is not null or (select private.client_id()) is not null)
  );

create policy feedback_attachments_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'feedback-attachments' and (select private.is_admin()));
