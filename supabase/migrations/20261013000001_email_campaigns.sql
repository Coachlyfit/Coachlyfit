-- Admin email campaigns: an admin composes one email and sends it to coaches.
-- These two tables are the history of what was sent and to whom.
--
-- Admin only. A coach or client has no policy and no grant on either table.
-- Rows are written by the send action through the admin's own session (RLS),
-- not through the service_role client.

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(subject) between 1 and 200),
  -- Markdown source as the admin typed it. It is rendered (and escaped) by
  -- src/domain/emails/campaign-email.ts for both the preview and the send.
  body text not null check (char_length(body) between 1 and 20000),
  direction text not null check (direction in ('rtl', 'ltr')),
  recipient_filter text not null check (recipient_filter in ('all', 'active', 'selected')),
  recipient_count integer not null check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  sent_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index email_campaigns_created_at_idx on public.email_campaigns (created_at desc);

-- coach_id and email are a snapshot with no foreign key to the coach, same as
-- admin_audit_log: the record of who was emailed survives the coach's deletion.
create table public.email_campaign_recipients (
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  coach_id uuid not null,
  email text not null,
  status text not null check (status in ('sent', 'failed')),
  error text,
  sent_at timestamptz,
  primary key (campaign_id, coach_id)
);

alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;

create policy admin_read on public.email_campaigns for select to authenticated
  using ((select private.is_admin()));
create policy admin_insert on public.email_campaigns for insert to authenticated
  with check ((select private.is_admin()) and sent_by = (select auth.uid()));
create policy admin_update_counts on public.email_campaigns for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy admin_read on public.email_campaign_recipients for select to authenticated
  using ((select private.is_admin()));
create policy admin_insert on public.email_campaign_recipients for insert to authenticated
  with check ((select private.is_admin()));

-- Update is granted per column: the send action fills in the two counters
-- after the batches finish, and nothing else about a sent campaign can change.
-- No delete for anyone but service_role.
revoke all on public.email_campaigns from anon, authenticated;
revoke all on public.email_campaign_recipients from anon, authenticated;
grant select, insert on public.email_campaigns to authenticated;
grant update (sent_count, failed_count) on public.email_campaigns to authenticated;
grant select, insert on public.email_campaign_recipients to authenticated;
grant select, insert, update, delete on public.email_campaigns to service_role;
grant select, insert, update, delete on public.email_campaign_recipients to service_role;

-- Who an admin can email. Coach addresses live in auth.users and the
-- suppression list is service_role-only, so the recipient list is resolved
-- here, behind the admin check, instead of with the service_role client.
-- Suspended coaches and suppressed addresses (bounced, complained,
-- unsubscribed) are left out. profiles.email_notifications is not checked:
-- that toggle covers the automatic notification emails only.
create function public.admin_email_recipients()
returns table (
  coach_id uuid,
  business_name text,
  owner_name text,
  email text,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  return query
    select c.id, c.business_name, p.full_name, u.email::text, s.status
    from public.coaches c
    join public.profiles p on p.id = c.id
    join auth.users u on u.id = c.id
    left join public.subscriptions s on s.coach_id = c.id
    where p.suspended_at is null
      and u.email is not null
      and not exists (
        select 1 from public.email_suppressions e where lower(e.email) = lower(u.email::text)
      )
    order by c.business_name;
end;
$$;

revoke execute on function public.admin_email_recipients() from public, anon;
grant execute on function public.admin_email_recipients() to authenticated;
