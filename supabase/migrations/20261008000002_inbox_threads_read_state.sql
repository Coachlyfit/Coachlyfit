-- Adds the last message's read_at to the coach inbox summary so the list can
-- filter "my last message hasn't been read by the client yet" without an
-- extra query per thread. Appended at the end: `create or replace view` can
-- only add columns after the existing ones. Still security_invoker, so the
-- caller's own RLS on clients / messages applies (see 20260913000001).
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
  m.read_at as last_read_at
from public.clients c
left join lateral (
  select body, sender_role, created_at, read_at
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

-- The unread count above runs once per client on every inbox refresh (and
-- the refresh now also fires on read receipts), so keep it an index-only
-- lookup over the few unread rows instead of a scan of the whole thread.
create index messages_unread_idx
  on public.messages (client_id, sender_role)
  where read_at is null;
