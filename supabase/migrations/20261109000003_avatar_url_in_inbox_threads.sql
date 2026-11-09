-- Expose the client's avatar on the coach inbox threads view so the message
-- list and the conversation header can show the client's photo instead of
-- initials. Appended at the end: `create or replace view` can only add
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
  m.kind as last_kind,
  prof.avatar_url
from public.clients c
left join public.profiles prof on prof.id = c.profile_id
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
