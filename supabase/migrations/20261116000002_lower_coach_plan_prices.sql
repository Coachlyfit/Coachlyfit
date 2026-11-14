-- Price list set ~20% under the competitor's, rounded to x99. Prices are data:
-- the admin Plans tab (admin_update_tiers) can change any of these later.
-- Tiers are matched by plan family + client cap (Pro Coach has one row per cap).
update public.subscription_tiers t
set price_egp_monthly = v.price
from (values
  ('starter', 30,           399),
  ('pro',     100,          799),
  ('elite',   150,          1599),
  ('elite',   250,          2399),
  ('elite',   500,          3999),
  ('elite',   1000,         5599),
  ('elite',   2000,         7999),
  ('elite',   5000,         11999),
  ('elite',   10000,        14399),
  ('elite',   null::int,    15999)
) as v(key, clients, price)
where t.key = v.key
  and t.max_clients is not distinct from v.clients;
