-- Structured coach notes: client_observations gains title / category /
-- severity / linked item / image. The old free-text `body` becomes `details`
-- (renamed, not dropped -- no data copy, nothing destroyed) and the title is
-- backfilled from its first 60 chars so old notes keep displaying.
--
-- Table RLS is unchanged on purpose (coach_rw + coach_read_own, no client or
-- admin policy): only the owning coach (or their team) reads/writes notes.
-- The image bucket below mirrors that: coach folder for read, coach folder +
-- active client for write, nothing for clients or admins.

alter table public.client_observations rename column body to details;
alter table public.client_observations alter column details drop not null;

alter table public.client_observations
  add column title text,
  add column category text not null default 'general',
  add column severity text,
  add column image_path text,
  add column linked_type text,
  add column linked_id uuid;

update public.client_observations
   set title = coalesce(
     nullif(left(regexp_replace(btrim(coalesce(details, '')), '\s+', ' ', 'g'), 60), ''),
     '-'
   );

alter table public.client_observations alter column title set not null;

alter table public.client_observations
  add constraint client_observations_category_check
    check (category in ('general', 'technique', 'adherence', 'nutrition', 'injury_pain', 'mental_state')),
  add constraint client_observations_severity_check
    check (severity is null or severity in ('low', 'medium', 'high')),
  add constraint client_observations_linked_type_check
    check (linked_type is null or linked_type in ('program', 'check_in', 'exercise')),
  -- linked_id is polymorphic (no FK); labels are resolved through RLS-governed
  -- reads, so a foreign id just renders as "unavailable".
  add constraint client_observations_linked_pair_check
    check ((linked_type is null) = (linked_id is null));

-- -----------------------------------------------------------------------------
-- Storage: private bucket, path = coach_id/client_id/<uuid>.<ext>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('observation-images', 'observation-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy observation_images_coach_select on storage.objects for select to authenticated
  using (
    bucket_id = 'observation-images'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

create policy observation_images_coach_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'observation-images'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
    and (storage.foldername(name))[2] in (select id::text from private.active_client_ids() id)
  );

create policy observation_images_coach_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'observation-images'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
    and (storage.foldername(name))[2] in (select id::text from private.active_client_ids() id)
  );
