-- Coach inbox summary: one row per client with last-message preview and
-- unread count, so the inbox list doesn't need N+1 queries. security_invoker
-- means this view runs with the querying user's own RLS (coach_rw/client_rw
-- on messages, existing clients policies) rather than the view owner's.
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
  coalesce(u.unread, 0)::int as unread_count
from public.clients c
left join lateral (
  select body, sender_role, created_at
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
