-- Coach -> client billing: packages and payment methods are coach-wide
-- catalogs (no client_id — a coach defines them once, reuses them across
-- clients). Subscriptions and transactions are per-client.
--
-- Deliberately separate from subscription_tiers/subscriptions/payments
-- (20260731000010_billing.sql) — those are coach -> platform (what the
-- coach pays Coachly Fit); these are coach -> client (what the coach's own
-- clients pay them). Different money, different direction, same coach.
--
-- No client read policy on any of these four tables: the client app has no
-- billing surface yet (a client sees their plans/progress, not their own
-- payment history) — add client_read_own if that becomes a real request,
-- same pattern as every other table here.
--
-- "Expired" is not a stored status: end_date < current_date is checked at
-- read time (client-subscription.ts), not maintained by a cron. status only
-- tracks what a coach explicitly did (freeze/cancel) -- nothing needs to
-- react to a subscription silently expiring, so there is no fourth state to
-- keep in sync.

create table public.client_packages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  duration_days int not null,
  price_egp numeric not null,
  description_ar text,
  description_en text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.client_payment_methods (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  created_at timestamptz not null default now()
);

create table public.client_subscriptions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- restrict (the default): a package with an active/past subscription
  -- against it can't be deleted out from under that history.
  package_id uuid not null references public.client_packages (id),
  status text not null default 'active' check (status in ('active', 'frozen', 'canceled')),
  start_date date not null default current_date,
  end_date date not null,
  frozen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.client_transactions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  subscription_id uuid not null references public.client_subscriptions (id) on delete cascade,
  payment_method_id uuid not null references public.client_payment_methods (id),
  amount_egp numeric not null,
  transaction_date date not null default current_date,
  -- Private bucket, coach-only, path convention `coach_id/client_id/file` --
  -- same convention as progress-media (20260731000009_progress.sql).
  proof_path text,
  recorded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index client_packages_coach_id_idx on public.client_packages (coach_id);
create index client_payment_methods_coach_id_idx on public.client_payment_methods (coach_id);
create index client_subscriptions_coach_id_idx on public.client_subscriptions (coach_id);
create index client_subscriptions_client_id_idx on public.client_subscriptions (client_id, created_at desc);
create index client_transactions_coach_id_idx on public.client_transactions (coach_id);
create index client_transactions_client_id_idx on public.client_transactions (client_id, transaction_date desc);
create index client_transactions_subscription_id_idx on public.client_transactions (subscription_id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'client_packages', 'client_payment_methods', 'client_subscriptions', 'client_transactions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy coach_rw on public.%I for all to authenticated
         using (coach_id = (select private.coach_id()))
         with check (coach_id = (select private.coach_id()))', t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- Proof-of-payment uploads: private bucket, coach-only (no client policy --
-- a client does not upload or view their own payment proof in this pass).
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false);

create policy payment_proofs_coach_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

create policy payment_proofs_coach_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

create policy payment_proofs_coach_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );
