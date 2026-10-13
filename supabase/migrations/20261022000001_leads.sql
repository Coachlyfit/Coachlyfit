-- Leads: prospective coaches the admin emails by hand from /admin/emails.
-- They have no account, so nothing here references auth.users or coaches.
--
-- Admin only, through the admin's own session (RLS). The one thing anyone
-- else can do is unsubscribe, through lead_unsubscribe() and by token only.

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  -- Lowercased and trimmed by leads_guard, so the unique constraint is
  -- case-insensitive in practice.
  email text not null unique check (char_length(email) between 3 and 320),
  full_name text check (char_length(full_name) <= 100),
  source text check (char_length(source) <= 50),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'replied', 'signed_up', 'unsubscribed')),
  notes text check (char_length(notes) <= 2000),
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  unsubscribed_at timestamptz,
  last_contacted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_created_at_idx on public.leads (created_at desc);

create table public.lead_email_sends (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  subject text not null,
  brevo_message_id text,
  status text not null check (status in ('sent', 'failed')),
  error text,
  sent_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index lead_email_sends_lead_idx on public.lead_email_sends (lead_id, created_at desc);

-- Normalises the address and keeps status and unsubscribed_at in step: an
-- unsubscribed lead stays unsubscribed whatever status an update asks for, so
-- changing the status in the admin table can never resubscribe someone.
create function private.leads_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));

  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.unsubscribe_token := old.unsubscribe_token;
    new.unsubscribed_at := coalesce(old.unsubscribed_at, new.unsubscribed_at);
  end if;

  if new.unsubscribed_at is not null then
    new.status := 'unsubscribed';
  elsif new.status = 'unsubscribed' then
    new.unsubscribed_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger leads_guard
  before insert or update on public.leads
  for each row execute function private.leads_guard();

alter table public.leads enable row level security;
alter table public.lead_email_sends enable row level security;

create policy admin_all on public.leads for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy admin_read on public.lead_email_sends for select to authenticated
  using ((select private.is_admin()));
create policy admin_insert on public.lead_email_sends for insert to authenticated
  with check ((select private.is_admin()) and sent_by = (select auth.uid()));

-- The send log is append-only for the admin; rows go when their lead does.
revoke all on public.leads from anon, authenticated;
revoke all on public.lead_email_sends from anon, authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert on public.lead_email_sends to authenticated;
grant select, insert, update, delete on public.leads to service_role;
grant select, insert, update, delete on public.lead_email_sends to service_role;

-- The public /unsubscribe page and the one-click endpoint are anonymous and
-- have no access to `leads`. This is the one thing they can do: read whether
-- a token is live, and with p_confirm mark its lead unsubscribed. The token
-- is a random uuid, so the answer says nothing about any email address.
-- Returns 'invalid', 'active' or 'unsubscribed'.
create function public.lead_unsubscribe(p_token uuid, p_confirm boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
begin
  select * into v_lead from public.leads where unsubscribe_token = p_token;
  if v_lead.id is null then
    return 'invalid';
  end if;

  if v_lead.unsubscribed_at is not null then
    return 'unsubscribed';
  end if;

  if not p_confirm then
    return 'active';
  end if;

  update public.leads
  set unsubscribed_at = now(), status = 'unsubscribed'
  where id = v_lead.id;
  return 'unsubscribed';
end;
$$;

revoke execute on function public.lead_unsubscribe(uuid, boolean) from public;
grant execute on function public.lead_unsubscribe(uuid, boolean) to anon, authenticated;

-- A lead who signs up as a coach is marked signed_up. Separate from
-- handle_new_user() and swallowing every error: this is bookkeeping, and it
-- must never be the reason a signup fails.
create function private.mark_lead_signed_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.leads l
  set status = 'signed_up'
  from auth.users u
  where u.id = new.id
    and l.email = lower(u.email::text)
    and l.unsubscribed_at is null;
  return new;
exception when others then
  return new;
end;
$$;

create trigger coaches_mark_lead_signed_up
  after insert on public.coaches
  for each row execute function private.mark_lead_signed_up();
