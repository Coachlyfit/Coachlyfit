-- Finance page (/finance): one place for coach -> client invoices and the
-- payments recorded against them.
--
-- Three gaps this closes:
--   1. invoices had no paid_at, so "collected this month" and "paid on" could
--      only be guessed from due_date.
--   2. A payment could not be recorded against an invoice: marking paid was a
--      bare status flip (no method, no date), and client_transactions required
--      a subscription. record_invoice_payment() now does both in one step.
--   3. The summary cards need totals without loading every row --
--      coach_finance_summary.
--
-- "Overdue" stays derived (issued + due_date passed), never stored.

alter table public.invoices add column paid_at timestamptz;

-- Legacy paid rows: best available date. Runs as the migration owner, so
-- guard_invoice_change() lets it through.
update public.invoices i
set paid_at = coalesce(
  (select t.transaction_date::timestamptz from public.client_transactions t where t.id = i.transaction_id),
  i.issue_date::timestamptz,
  i.created_at
)
where i.status = 'paid';

-- A payment against a manual invoice has no subscription behind it, and an
-- invoice may be in SAR/AED. amount_egp then holds the amount in `currency`;
-- the column name is a known misnomer, renaming it is a separate change.
alter table public.client_transactions
  alter column subscription_id drop not null,
  add column currency text not null default 'EGP' check (currency in ('EGP', 'SAR', 'AED'));

-- Same rules as 20260929000001_invoices.sql, plus paid_at: stamped here on
-- issued -> paid and otherwise pinned to its old value, so an app request can
-- neither forge nor clear it.
create or replace function private.guard_invoice_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.invoice_number is not null or new.snapshot is not null or new.paid_at is not null then
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
    if new.status <> 'draft' or new.invoice_number is not null or new.snapshot is not null or new.paid_at is not null then
      raise exception 'A draft can only be issued through issue_invoice().' using errcode = '42501';
    end if;
    return new;
  end if;

  new.paid_at := case
    when old.status = 'issued' and new.status = 'paid' then now()
    else old.paid_at
  end;

  if (to_jsonb(new) - 'status' - 'paid_at') <> (to_jsonb(old) - 'status' - 'paid_at') then
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

-- Issued -> paid with the payment behind it. Full payment only: the status
-- model has no "partially paid". Security definer because the guard above
-- (rightly) stops an app request from linking a transaction to an issued
-- invoice -- so every check RLS would have made is repeated here: own
-- invoice, a client still actively coached (same as coach_rw on invoices),
-- own payment method, proof inside the coach's own folder.
--
-- An invoice created from a recorded payment (createFromTransaction) already
-- has its transaction; it is only marked paid, not paid twice.
create function public.record_invoice_payment(
  p_invoice_id uuid,
  p_payment_method_id uuid,
  p_paid_on date default null,
  p_proof_path text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_coach_id uuid := (select private.coach_id());
  v_paid_on date := coalesce(p_paid_on, current_date);
  v_transaction_id uuid;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;

  if v_invoice.id is null
     or v_invoice.coach_id is distinct from v_coach_id
     or v_invoice.client_id not in (select private.active_client_ids()) then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;
  if v_invoice.status <> 'issued' then
    raise exception 'Only an issued invoice can be paid.' using errcode = '22023';
  end if;

  v_transaction_id := v_invoice.transaction_id;
  if v_transaction_id is null then
    if not exists (
      select 1 from public.client_payment_methods m
      where m.id = p_payment_method_id and m.coach_id = v_coach_id
    ) then
      raise exception 'Payment method not found.' using errcode = '22023';
    end if;
    if p_proof_path is not null
       and left(p_proof_path, 74) <> v_coach_id::text || '/' || v_invoice.client_id::text || '/' then
      raise exception 'Invalid proof path.' using errcode = '22023';
    end if;

    insert into public.client_transactions (
      coach_id, client_id, payment_method_id, amount_egp, currency, transaction_date, proof_path, recorded_by
    )
    values (
      v_coach_id, v_invoice.client_id, p_payment_method_id, v_invoice.total, v_invoice.currency,
      v_paid_on, p_proof_path, (select auth.uid())
    )
    returning id into v_transaction_id;
  end if;

  update public.invoices
  set status = 'paid', paid_at = v_paid_on::timestamptz, transaction_id = v_transaction_id
  where id = p_invoice_id
  returning * into v_invoice;

  return v_invoice;
end;
$$;

-- anon too: Supabase's default privileges grant it explicitly, so revoking
-- from public alone leaves it (see 20260930000005).
revoke execute on function public.record_invoice_payment(uuid, uuid, date, text) from public, anon;
grant execute on function public.record_invoice_payment(uuid, uuid, date, text) to authenticated;

-- Summary cards for /finance: one row per currency (no FX, so currencies are
-- never added together). security_invoker, same reasoning as
-- coach_client_roster (20261005000002): the view runs under the caller's own
-- RLS on invoices / client_transactions and adds no access.
--
-- Collected = every recorded payment, plus paid invoices that have no
-- payment row (marked paid before record_invoice_payment existed) -- the two
-- sets are disjoint, so nothing is counted twice.
create view public.coach_finance_summary
with (security_invoker = true) as
with collected as (
  select coach_id, currency, amount_egp as amount, transaction_date as paid_on
  from public.client_transactions
  union all
  select coach_id, currency, total, paid_at::date
  from public.invoices
  where status = 'paid' and transaction_id is null
),
c as (
  select
    coach_id,
    currency,
    sum(amount) as collected_total,
    coalesce(sum(amount) filter (where paid_on >= date_trunc('month', current_date)::date), 0) as collected_month
  from collected
  group by coach_id, currency
),
o as (
  select
    coach_id,
    currency,
    coalesce(sum(total) filter (where due_date is null or due_date >= current_date), 0) as outstanding_amount,
    count(*) filter (where due_date is null or due_date >= current_date) as outstanding_count,
    coalesce(sum(total) filter (where due_date < current_date), 0) as overdue_amount,
    count(*) filter (where due_date < current_date) as overdue_count,
    -- Still owed and due by month end -- overdue ones included.
    coalesce(sum(total) filter (
      where due_date < (date_trunc('month', current_date) + interval '1 month')::date
    ), 0) as due_by_month_end
  from public.invoices
  where status = 'issued'
  group by coach_id, currency
)
select
  coalesce(c.coach_id, o.coach_id) as coach_id,
  coalesce(c.currency, o.currency) as currency,
  coalesce(c.collected_month, 0) as collected_month,
  coalesce(c.collected_total, 0) as collected_total,
  coalesce(c.collected_month, 0) + coalesce(o.due_by_month_end, 0) as expected_month,
  coalesce(o.outstanding_amount, 0) as outstanding_amount,
  coalesce(o.outstanding_count, 0) as outstanding_count,
  coalesce(o.overdue_amount, 0) as overdue_amount,
  coalesce(o.overdue_count, 0) as overdue_count
from c
full join o on o.coach_id = c.coach_id and o.currency = c.currency;

grant select on public.coach_finance_summary to authenticated;
grant select on public.coach_finance_summary to service_role;
