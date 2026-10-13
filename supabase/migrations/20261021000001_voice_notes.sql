-- Voice notes in the coach<->client thread. A voice note is a messages row
-- (kind = 'voice') plus one file in a private bucket; the row outlives the
-- file, which the voice-notes-cleanup cron removes after the retention
-- window (src/domain/messages/voice-notes.ts) and marks with
-- audio_deleted_at so the thread shows an "expired" placeholder.
--
-- Columns on messages rather than an attachments table: one attachment per
-- message, the same RLS, and the row is already in the realtime publication.

alter table public.messages
  add column kind text not null default 'text' check (kind in ('text', 'voice')),
  add column audio_path text,
  add column audio_mime text,
  add column audio_duration_sec smallint,
  add column audio_size_bytes int,
  add column audio_deleted_at timestamptz;

-- body stays NOT NULL ('' for a voice note) so every existing reader keeps
-- a plain string. The path is tied to the row's own id, so a row can't be
-- pointed at another message's file.
alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_content_check check (
  (
    kind = 'text'
    and char_length(body) between 1 and 2000
    and audio_path is null
    and audio_mime is null
    and audio_duration_sec is null
    and audio_size_bytes is null
    and audio_deleted_at is null
  )
  or (
    kind = 'voice'
    and body = ''
    and audio_mime in ('audio/webm', 'audio/mp4')
    and audio_duration_sec between 1 and 120
    and audio_size_bytes between 1 and 512000
    and split_part(audio_path, '/', 2) in (id::text || '.webm', id::text || '.mp4')
  )
);

-- One file per message, and the cleanup job's lookup by path.
create unique index messages_audio_path_idx
  on public.messages (audio_path)
  where audio_path is not null;

-- The inbox preview has to know the last message is a voice note (its body
-- is empty). Appended at the end: `create or replace view` can only add
-- columns after the existing ones (see 20261008000002).
create or replace view public.coach_inbox_threads
with (security_invoker = true) as
select
  c.id as client_id,
  c.coach_id,
  c.display_name,
  c.status,
  m.body as last_body,
  m.sender_role as last_sender_role,
  m.created_at as last_message_at,
  coalesce(u.unread, 0)::int as unread_count,
  m.read_at as last_read_at,
  m.kind as last_kind
from public.clients c
left join lateral (
  select body, sender_role, created_at, read_at, kind
  from public.messages
  where client_id = c.id
  order by created_at desc
  limit 1
) m on true
left join lateral (
  select count(*) as unread
  from public.messages
  where client_id = c.id and sender_role = 'client' and read_at is null
) u on true;

-- ---------------------------------------------------------------------------
-- Storage. Private bucket, path `relationship_id/message_id.ext`: the
-- relationship is what messages' own policies authorize on, so the file
-- follows the conversation it belongs to. The size and type limits are the
-- bucket's own, so they hold for an upload that skips the server action.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-notes', 'voice-notes', false, 512000, array['audio/webm', 'audio/mp4']);

-- Coach: only conversations they actively coach, same set as messages'
-- coach_rw. No admin policy, as on messages.
create policy voice_notes_coach_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] in (select id::text from private.active_relationship_ids() id)
  );

create policy voice_notes_coach_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] in (select id::text from private.active_relationship_ids() id)
  );

-- Client: reads every era of their own thread (messages' client_rw does the
-- same), writes only into the live one.
create policy voice_notes_client_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] in (
      select r.id::text from public.coaching_relationships r
      where r.client_id = (select private.client_id())
    )
  );

create policy voice_notes_client_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] in (
      select r.id::text from public.coaching_relationships r
      where r.client_id = (select private.client_id()) and r.status = 'active'
    )
  );

-- No update or delete policy: a voice note is immutable, and only the
-- cleanup cron (service_role) removes files.

-- What the cleanup cron should remove next: files past retention, plus
-- files older than p_orphan_before that no message points at (an upload
-- whose row never landed). Only lists them -- the cron deletes through the
-- Storage API, which is what actually frees the bytes.
create function public.voice_notes_to_delete(
  p_before timestamptz,
  p_orphan_before timestamptz,
  p_limit int
)
returns setof text
language sql
stable
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'voice-notes'
    and (
      o.created_at < p_before
      or (
        o.created_at < p_orphan_before
        and not exists (select 1 from public.messages m where m.audio_path = o.name)
      )
    )
  order by o.created_at
  limit p_limit
$$;

-- Cron only, revoked by name like snapshot_mrr() (20261011000002).
revoke execute on function public.voice_notes_to_delete(timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.voice_notes_to_delete(timestamptz, timestamptz, int) to service_role;
