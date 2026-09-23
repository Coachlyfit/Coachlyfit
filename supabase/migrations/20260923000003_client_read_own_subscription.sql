-- Client needs to read their own subscription status to enforce the
-- expired-access gate in (client)/c/layout.tsx server-side (RLS is the real
-- boundary, the layout redirect is UX on top). Anticipated by the comment
-- in 20260822000001_client_billing.sql: "add client_read_own if that
-- becomes a real request, same pattern as every other table here." Only
-- client_subscriptions needs it -- packages/payment methods/transactions
-- have no client-facing surface yet.
create policy client_read_own on public.client_subscriptions
  for select to authenticated
  using (client_id = (select private.client_id()));
