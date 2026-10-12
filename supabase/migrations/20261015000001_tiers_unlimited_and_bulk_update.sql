-- "No client cap" becomes a real null instead of the 999999 sentinel the top
-- tier was seeded with. private.enforce_client_cap() already returns early
-- when the tier's max is null, so no trigger change is needed.
--
-- Existing 999999 rows are NOT rewritten here: that backfill is a separate,
-- explicitly approved step.
alter table public.subscription_tiers alter column max_clients drop not null;

alter table public.subscription_tiers
  add constraint subscription_tiers_max_clients_positive check (max_clients is null or max_clients >= 1);

-- Admin settings saves every plan from one comparison table. One function
-- call = one transaction, so a bad row can't leave the plans half-updated.
-- Security invoker: the admin_write RLS policy is the authorization; the
-- explicit check only turns "0 rows" into a clear 42501 for non-admins.
create function public.admin_update_tiers(p_tiers jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  update public.subscription_tiers t
  set name_ar = x.name_ar,
      name_en = x.name_en,
      price_egp_monthly = x.price_egp_monthly,
      max_clients = x.max_clients,
      is_active = x.is_active,
      features = x.features
  from jsonb_to_recordset(p_tiers) as x(
    id uuid,
    name_ar text,
    name_en text,
    price_egp_monthly numeric,
    max_clients int,
    is_active boolean,
    features jsonb
  )
  where t.id = x.id;

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_tiers) then
    raise exception 'Unknown plan.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.admin_update_tiers(jsonb) from public, anon;
grant execute on function public.admin_update_tiers(jsonb) to authenticated;
