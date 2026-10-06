-- coach_finance_summary.expected_month ignored issued invoices with no
-- due_date, so an undated invoice was "outstanding" yet missing from
-- "expected" (the card read "0 of 0 expected" with money owed). An undated
-- issued invoice is owed now, so it counts as expected this month.
-- Only due_by_month_end changes; columns and security_invoker are as in
-- 20261006000002_finance.sql.
create or replace view public.coach_finance_summary
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
    -- Still owed and due by month end -- overdue and undated ones included.
    coalesce(sum(total) filter (
      where due_date is null or due_date < (date_trunc('month', current_date) + interval '1 month')::date
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
