-- Support tickets: the tenant owner writes to the platform team and gets an
-- answer. Owner only on the coach side (not team members), admins see all,
-- clients nothing.
--
-- A coach has no insert, update or delete policy on a ticket. Their three
-- writes are functions: create_support_ticket(), support_mark_read() and
-- support_reopen_ticket(). So "a coach can't change the status" needs no
-- column guard.

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 150),
  category text not null check (category in ('technical', 'billing', 'feature_request', 'other')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'waiting_on_coach', 'closed')),
  -- Set by ticket_messages_after_insert, cleared by support_mark_read().
  -- admin_unread is shared by all admins: one inbox, not one per person.
  coach_unread boolean not null default false,
  admin_unread boolean not null default true,
  last_message_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_coach_idx on public.support_tickets (coach_id, last_message_at desc);
create index support_tickets_status_idx on public.support_tickets (status, last_message_at desc);
create index support_tickets_admin_unread_idx on public.support_tickets (last_message_at desc) where admin_unread;

-- The ticket's description is its first message, so the thread and the
-- attachments have one shape.
create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  sender_role text not null check (sender_role in ('coach', 'admin')),
  body text not null check (char_length(body) between 1 and 5000),
  is_internal boolean not null default false,
  attachment_paths text[] not null default '{}' check (cardinality(attachment_paths) <= 4),
  created_at timestamptz not null default now(),
  -- An internal note is admin-only and carries no files, so nothing internal
  -- ever sits in a storage folder the coach can read.
  check (not is_internal or (sender_role = 'admin' and cardinality(attachment_paths) = 0))
);

create index ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);

-- updated_at is derived, and closed_at follows the status. Only an admin or
-- the service role can update a ticket at all (see the policies below).
create function private.support_tickets_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.coach_id := old.coach_id;
  new.created_at := old.created_at;
  if new.status is distinct from old.status then
    new.closed_at := case when new.status = 'closed' then now() else null end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger support_tickets_touch
  before update on public.support_tickets
  for each row execute function private.support_tickets_touch();

-- Who wrote a message is decided here, not by the caller. A null auth.uid()
-- is the service role, which keeps what it sent.
create function private.ticket_messages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ticket public.support_tickets;
begin
  select * into v_ticket from public.support_tickets where id = new.ticket_id;
  if v_ticket.id is null then
    raise exception 'Ticket not found.' using errcode = '42501';
  end if;

  if v_uid is not null then
    new.author_id := v_uid;
    new.sender_role := case when private.is_admin() then 'admin' else 'coach' end;
  end if;
  new.created_at := now();

  if new.sender_role = 'coach' then
    if new.is_internal then
      raise exception 'Only admins write internal notes.' using errcode = '42501';
    end if;
    if v_ticket.status = 'closed' then
      raise exception 'This ticket is closed.' using errcode = '23514', hint = 'ticket_closed';
    end if;
  end if;

  -- Files live under coach/ticket/message, so a row can only name its own.
  if exists (
    select 1 from unnest(new.attachment_paths) p
    where not starts_with(p, v_ticket.coach_id::text || '/' || new.ticket_id::text || '/' || new.id::text || '/')
  ) then
    raise exception 'Attachment does not belong to this message.'
      using errcode = '23514', hint = 'invalid_attachment';
  end if;

  return new;
end;
$$;

create trigger ticket_messages_guard
  before insert on public.ticket_messages
  for each row execute function private.ticket_messages_guard();

-- Bookkeeping on the ticket. Internal notes change nothing the coach can see.
create function private.ticket_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_internal then
    return new;
  end if;

  update public.support_tickets
  set last_message_at = new.created_at,
      coach_unread = (new.sender_role = 'admin'),
      admin_unread = (new.sender_role = 'coach'),
      status = case
        when new.sender_role = 'coach' and status = 'waiting_on_coach' then 'open'
        when new.sender_role = 'admin' and status in ('open', 'in_progress') then 'waiting_on_coach'
        else status
      end
  where id = new.ticket_id;

  return new;
end;
$$;

create trigger ticket_messages_after_insert
  after insert on public.ticket_messages
  for each row execute function private.ticket_messages_after_insert();

-- ---------------------------------------------------------------------------
-- RLS

alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;

-- coach_id references coaches(id), so coach_id = auth.uid() only matches the
-- tenant owner (same test as tasks.owner_all). The coach_id() comparison adds
-- the role check: an account whose role was changed away from coach loses
-- access.
create policy owner_read on public.support_tickets
  for select to authenticated
  using (
    coach_id = (select auth.uid())
    and (select private.coach_id()) = (select auth.uid())
  );

create policy admin_all on public.support_tickets
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- The subquery runs under the caller's own ticket policies, so a message is
-- visible exactly when its ticket is (task_comments does the same).
create policy owner_read on public.ticket_messages
  for select to authenticated
  using (
    not is_internal
    and exists (select 1 from public.support_tickets t where t.id = ticket_id)
  );

create policy owner_insert on public.ticket_messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and sender_role = 'coach'
    and not is_internal
    and (select private.coach_id()) = (select auth.uid())
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and t.coach_id = (select auth.uid())
        and t.status <> 'closed'
    )
  );

create policy admin_all on public.ticket_messages
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- No insert on tickets (create_support_ticket only), no delete anywhere, and
-- messages are immutable. update on tickets is the admin's status change; a
-- coach has no update policy.
revoke all on public.support_tickets from anon, authenticated;
revoke all on public.ticket_messages from anon, authenticated;
grant select, update on public.support_tickets to authenticated;
grant select, insert on public.ticket_messages to authenticated;
grant select, insert, update, delete on public.support_tickets to service_role;
grant select, insert, update, delete on public.ticket_messages to service_role;

-- ---------------------------------------------------------------------------
-- The coach's three writes on a ticket.

-- Ticket and first message in one transaction. The ids come from the caller
-- because the files were uploaded under them first.
create function public.create_support_ticket(
  p_id uuid,
  p_message_id uuid,
  p_subject text,
  p_category text,
  p_body text,
  p_attachment_paths text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or (select private.coach_id()) is distinct from v_uid then
    raise exception 'Only the account owner can open a ticket.' using errcode = '42501';
  end if;

  if (select count(*) from public.support_tickets
      where coach_id = v_uid and status <> 'closed') >= 10 then
    raise exception 'Too many open tickets.' using errcode = '23514', hint = 'too_many_open';
  end if;

  insert into public.support_tickets (id, coach_id, subject, category)
  values (p_id, v_uid, trim(p_subject), p_category);

  insert into public.ticket_messages (id, ticket_id, sender_role, body, attachment_paths)
  values (p_message_id, p_id, 'coach', p_body, coalesce(p_attachment_paths, '{}'));

  return p_id;
end;
$$;

-- Clears the caller's own side of the unread state. Someone who is neither
-- an admin nor the ticket's owner matches no row.
create function public.support_mark_read(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_admin() then
    update public.support_tickets set admin_unread = false
    where id = p_ticket_id and admin_unread;
  else
    update public.support_tickets set coach_unread = false
    where id = p_ticket_id
      and coach_id = (select auth.uid())
      and (select private.coach_id()) = (select auth.uid())
      and coach_unread;
  end if;
end;
$$;

-- A recently closed ticket can be reopened by its owner; an old one can't,
-- so a months-old thread isn't brought back for a new problem.
create function public.support_reopen_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_tickets
  set status = 'open', admin_unread = true
  where id = p_ticket_id
    and coach_id = (select auth.uid())
    and (select private.coach_id()) = (select auth.uid())
    and status = 'closed'
    and closed_at > now() - interval '14 days';

  if not found then
    raise exception 'This ticket cannot be reopened.'
      using errcode = '23514', hint = 'reopen_not_allowed';
  end if;
end;
$$;

revoke execute on function public.create_support_ticket(uuid, uuid, text, text, text, text[]) from public, anon;
revoke execute on function public.support_mark_read(uuid) from public, anon;
revoke execute on function public.support_reopen_ticket(uuid) from public, anon;
grant execute on function public.create_support_ticket(uuid, uuid, text, text, text, text[]) to authenticated;
grant execute on function public.support_mark_read(uuid) to authenticated;
grant execute on function public.support_reopen_ticket(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage. Private bucket, path coach_id/ticket_id/message_id/file. The size
-- and type limits are the bucket's own, so they hold for a direct upload.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-attachments', 'support-attachments', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']);

-- private.coach_id() = auth.uid() is what keeps a client or a team member
-- from using a folder named after their own id.
create policy support_attachments_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.coach_id()) = (select auth.uid())
  );

create policy support_attachments_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.coach_id()) = (select auth.uid())
  );

create policy support_attachments_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'support-attachments' and (select private.is_admin()));

create policy support_attachments_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'support-attachments' and (select private.is_admin()));

-- No update or delete policy: attachments are immutable.
