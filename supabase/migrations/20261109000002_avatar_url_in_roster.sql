-- Expose the client's avatar on the coach roster view so the clients list can
-- render avatars in one query instead of N profile lookups. `profile_id` is
-- null for invited (unlinked) clients, so the left join yields null avatar_url
-- for them -- same as every other optional profile column here.
--
-- `avatar_url` is appended at the end so existing column positions are
-- preserved; `CREATE OR REPLACE VIEW` keeps the earlier columns unchanged and
-- only adds the new trailing one.
create or replace view public.coach_client_roster
with (security_invoker = true) as
select
  c.id as client_id,
  c.coach_id,
  c.display_name,
  c.email,
  c.status,
  c.created_at,
  k.last_checkin_date,
  k.adherence,
  p.id as program_id,
  p.name_ar as program_name_ar,
  p.name_en as program_name_en,
  s.status as subscription_status,
  s.end_date as subscription_end_date,
  prof.avatar_url
from public.clients c
left join public.profiles prof on prof.id = c.profile_id
-- last_checkin_date is all-time (a client quiet for 100 days has still
-- checked in before); adherence is the recent 90-day average only.
left join lateral (
  select
    max(checkin_date) as last_checkin_date,
    round(avg(adherence) filter (where checkin_date >= current_date - 90))::int as adherence
  from public.checkins
  where client_id = c.id
) k on true
-- Newest non-archived program -- same rule as
-- ProgramsService.getActiveTreeForClient.
left join lateral (
  select id, name_ar, name_en
  from public.programs
  where client_id = c.id and archived_at is null
  order by created_at desc
  limit 1
) p on true
-- Newest subscription -- same rule as ClientBillingService. "Expired" stays
-- derived at read time (client-subscription.ts), not computed here.
left join lateral (
  select status, end_date
  from public.client_subscriptions
  where client_id = c.id
  order by created_at desc
  limit 1
) s on true;
