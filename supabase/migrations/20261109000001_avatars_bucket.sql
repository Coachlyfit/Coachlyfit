-- Avatar photos: public bucket, path `{user_id}/avatar.{ext}`.
--
-- Public read is intentional: an avatar is a public profile picture, rendered
-- in the clients list, client portal, coach settings and header for anyone
-- viewing that profile. A public bucket lets the client portal and any
-- server-rendered page use `getPublicUrl` without signing, same as
-- `coach-logos`. Writes are limited to the file's owner via the `{user_id}/`
-- folder prefix, so a user can only touch their own avatar.
--
-- Validation (image type, 2 MB cap) happens server-side in AvatarService, so
-- the bucket itself carries no size/mime limits.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true);

-- Public read: any authenticated caller can read any object in the bucket.
-- The public URL works for unauthenticated viewers too (that's the point of a
-- public bucket), so profile avatars render everywhere without signing.
create policy avatars_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

-- Owners only: insert/update/delete are scoped to the caller's own folder via
-- auth.uid(), which is the real boundary (the client is never trusted with
-- user_id).
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
