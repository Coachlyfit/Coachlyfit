-- Storage policies for the `avatars` bucket. These mirror the policies defined
-- in migration 20261109000001_avatars_bucket.sql (kept here as a reference
-- copy; the migration is the source of truth that gets applied).
--
-- Path convention: `{user_id}/avatar.{ext}`. Public read is on; writes are
-- limited to the owner's folder via auth.uid().

create policy avatars_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
