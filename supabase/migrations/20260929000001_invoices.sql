-- Coach -> client invoices. Hangs off the coach -> client billing tables
-- (20260822000001_client_billing.sql), not the coach -> platform ones.
--
-- Lifecycle: draft -> issued -> paid, with void reachable from issued or
-- paid. A draft is freely editable/deletable by its coach; once issued an
-- invoice is a legal document -- only its status may move forward, and it
-- is never deleted (void it instead). Enforced by triggers below, not just
-- the UI.
--
-- Numbers (INV-0001...) are sequential per coach and assigned at issue time,
-- not at draft creation, so a deleted draft never leaves a gap. issue_invoice()
-- is the only path that assigns one.
--
-- Money stays `numeric` like every other billing table; currency is now
-- per-invoice (EGP/SAR/AED, the three the marketing page promises), no FX.

alter table public.coaches
  add column logo_path text,
  add column address text,
  add column tax_number text,
  add column contact_phone text,
  add column contact_email text,
  add column default_currency text not null default 'EGP'
    check (default_currency in ('EGP', 'SAR', 'AED')),
  add column default_tax_rate numeric not null default 0
    check (default_tax_rate >= 0 and default_tax_rate <= 100);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  -- No action (not cascade): deleting a client must not silently take their
  -- issued invoices with it. Clients are archived, never hard-deleted, in
  -- the app. A whole-coach delete still works: coach_id's cascade removes
  -- the invoices within the same statement, before NO ACTION is checked.
  client_id uuid not null references public.clients (id),
  transaction_id uuid references public.client_transactions (id) on delete set null,
  invoice_number text,
  issue_date date,
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'void')),
  currency text not null default 'EGP' check (currency in ('EGP', 'SAR', 'AED')),
  tax_rate numeric not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  notes text,
  -- Seller header + bill-to frozen at issue time, so an issued invoice
  -- reprints identically after the coach changes their address or the
  -- client's name is edited. Null while draft (drafts render live data).
  snapshot jsonb,
  created_at timestamptz not null default now(),
  -- NULLs are distinct, so any number of drafts coexist.
  unique (coach_id, invoice_number)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position int not null default 0,
  description text not null,
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  line_total numeric not null,
  created_at timestamptz not null default now()
);

-- Per-coach counter behind issue_invoice(). No grants and no policies:
-- only the security definer function touches it.
create table public.invoice_counters (
  coach_id uuid primary key references public.coaches (id) on delete cascade,
  last_number int not null default 0
);

create index invoices_coach_id_idx on public.invoices (coach_id, created_at desc);
create index invoices_client_id_idx on public.invoices (client_id);
create index invoices_transaction_id_idx on public.invoices (transaction_id);
create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id, position);

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_counters enable row level security;

-- client_id/transaction_id must belong to the same coach -- otherwise a
-- coach could address an invoice to (and so make it visible to) another
-- coach's client. The subqueries run under the caller's own RLS, so
-- they only ever see the caller's clients/transactions.
create policy coach_rw on public.invoices for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (
    coach_id = (select private.coach_id())
    and exists (select 1 from public.clients c where c.id = client_id)
    and (transaction_id is null or exists (select 1 from public.client_transactions t where t.id = transaction_id and t.client_id = invoices.client_id))
  );

-- A client never sees drafts -- a draft is the coach's scratchpad.
create policy client_read_own on public.invoices for select to authenticated
  using (client_id = (select private.client_id()) and status <> 'draft');

create policy admin_read on public.invoices for select to authenticated
  using (private.is_admin());

-- Items inherit visibility from their invoice: the subquery runs under the
-- caller's RLS on invoices, so one policy covers coach, client and admin.
create policy read_via_invoice on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id));

create policy coach_write on public.invoice_items for all to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.coach_id = (select private.coach_id())))
  with check (exists (select 1 from public.invoices i where i.id = invoice_id and i.coach_id = (select private.coach_id())));

grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_items to authenticated;
grant select, insert, update, delete on public.invoices to service_role;
grant select, insert, update, delete on public.invoice_items to service_role;
grant select, insert, update, delete on public.invoice_counters to service_role;

-- Immutability. Only the `authenticated` role (every app request) is
-- guarded: issue_invoice() runs as its owner (security definer), and FK
-- actions (coach cascade, transaction set-null) run as the table owner --
-- both are trusted paths that must be able to write issued rows.
create function private.guard_invoice_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.invoice_number is not null or new.snapshot is not null then
      raise exception 'New invoices must start as a draft.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Issued invoices cannot be deleted; void them instead.' using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status = 'draft' then
    if new.status <> 'draft' or new.invoice_number is not null or new.snapshot is not null then
      raise exception 'A draft can only be issued through issue_invoice().' using errcode = '42501';
    end if;
    return new;
  end if;

  if (to_jsonb(new) - 'status') <> (to_jsonb(old) - 'status') then
    raise exception 'An issued invoice cannot be edited, only marked paid or voided.' using errcode = '42501';
  end if;

  if new.status = old.status
     or (old.status = 'issued' and new.status in ('paid', 'void'))
     or (old.status = 'paid' and new.status = 'void') then
    return new;
  end if;

  raise exception 'Invalid invoice status change: % -> %.', old.status, new.status using errcode = '42501';
end;
$$;

create trigger invoices_guard_change
  before insert or update or delete on public.invoices
  for each row execute function private.guard_invoice_change();

create function private.guard_invoice_item_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_op <> 'INSERT' then
    select status into v_status from public.invoices where id = old.invoice_id;
    if v_status <> 'draft' then
      raise exception 'Items of an issued invoice cannot be changed.' using errcode = '42501';
    end if;
  end if;

  if tg_op <> 'DELETE' then
    select status into v_status from public.invoices where id = new.invoice_id;
    if v_status <> 'draft' then
      raise exception 'Items of an issued invoice cannot be changed.' using errcode = '42501';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger invoice_items_guard_change
  before insert or update or delete on public.invoice_items
  for each row execute function private.guard_invoice_item_change();

-- Draft -> issued. Allocates the next per-coach number race-safely: the
-- upsert takes a row lock on the coach's counter, so two concurrent issues
-- for the same coach serialize and get distinct consecutive numbers. The
-- invoice row itself is locked too, so the same draft can't be issued twice.
create function public.issue_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_coach public.coaches;
  v_client public.clients;
  v_n int;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;

  if v_invoice.id is null or v_invoice.coach_id is distinct from (select private.coach_id()) then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;
  if v_invoice.status <> 'draft' then
    raise exception 'Only a draft can be issued.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.invoice_items where invoice_id = p_invoice_id) then
    raise exception 'An invoice needs at least one item before it can be issued.' using errcode = '22023';
  end if;

  insert into public.invoice_counters (coach_id, last_number)
  values (v_invoice.coach_id, 1)
  on conflict (coach_id) do update set last_number = public.invoice_counters.last_number + 1
  returning last_number into v_n;

  select * into v_coach from public.coaches where id = v_invoice.coach_id;
  select * into v_client from public.clients where id = v_invoice.client_id;

  update public.invoices
  set status = 'issued',
      -- lpad truncates past its length, so widen past 9999 instead of
      -- silently turning INV-10000 into INV-1000.
      invoice_number = 'INV-' || lpad(v_n::text, greatest(4, length(v_n::text)), '0'),
      issue_date = coalesce(issue_date, current_date),
      snapshot = jsonb_build_object(
        'seller', jsonb_build_object(
          'business_name', v_coach.business_name,
          'logo_path', v_coach.logo_path,
          'address', v_coach.address,
          'tax_number', v_coach.tax_number,
          'contact_phone', v_coach.contact_phone,
          'contact_email', v_coach.contact_email
        ),
        'client', jsonb_build_object(
          'display_name', v_client.display_name,
          'email', v_client.email,
          'phone', v_client.phone
        )
      )
  where id = p_invoice_id
  returning * into v_invoice;

  return v_invoice;
end;
$$;

revoke execute on function public.issue_invoice(uuid) from public;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- Coach logo for the invoice header. Public bucket: a logo isn't sensitive,
-- and a public URL lets the client portal and print page render it without
-- signing. Writes are limited to the coach's own `coach_id/` folder, same
-- path convention as payment-proofs.
insert into storage.buckets (id, name, public)
values ('coach-logos', 'coach-logos', true);

create policy coach_logos_coach_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'coach-logos'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

create policy coach_logos_coach_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'coach-logos'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

create policy coach_logos_coach_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'coach-logos'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );
