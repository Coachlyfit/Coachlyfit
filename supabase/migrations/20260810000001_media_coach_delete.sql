-- Coach-initiated delete of a progress photo. `media` today only grants the
-- coach coach_read (select) — client_own (20260731000009_progress.sql) is
-- FOR ALL but scoped to client_id = private.client_id(), so it never lets a
-- coach through. This is deliberately scoped to delete only: the coach still
-- has no insert/update path onto a client's self-reported media, same
-- reasoning as checkins/body_metrics (coach editing self-reported data would
-- be misleading) — deleting a photo isn't editing it, it's the coach's own
-- moderation/cleanup call on data living in their tenant.
--
-- The storage.objects DELETE policy (progress_media_delete, same migration)
-- already allows the coach to remove the underlying file — only the media
-- table row itself was missing a coach delete grant.
create policy coach_delete on public.media for delete to authenticated
  using (coach_id = (select private.coach_id()));
