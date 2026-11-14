-- One plan catalogue: New Coach / Ambitious Coach / Pro Coach.
--
-- The plans stay rows of subscription_tiers, so the cap triggers, the feature
-- gates, subscriptions.tier_id, subscription_requests.tier_id and the admin
-- RPCs keep working untouched. Keys are kept (starter -> New Coach,
-- pro -> Ambitious Coach, elite -> Pro Coach), and Pro Coach is sold in
-- client tiers, each its own row sharing key 'elite'. That makes `key` a plan
-- family rather than a unique id, so its unique constraint goes; the
-- check (key in starter/pro/elite) stays. Nothing here is deleted.

alter table public.subscription_tiers drop constraint subscription_tiers_key_key;

alter table public.subscription_tiers
  add column description_ar text,
  add column description_en text;

-- Existing rows are updated in place so current subscribers carry over.
update public.subscription_tiers
set name_ar = 'مدرب جديد',
    name_en = 'New Coach',
    description_ar = 'للمدرب اللي لسه بيبدأ يكبّر شغله',
    description_en = 'For coaches just starting to grow',
    price_egp_monthly = 499,
    max_clients = 30,
    max_team_members = 1,
    features = '{"white_label": false, "forms_builder": true, "custom_library": true, "custom_branding": false, "task_management": true, "priority_support": false}'::jsonb,
    is_active = true
where key = 'starter';

update public.subscription_tiers
set name_ar = 'مدرب طموح',
    name_en = 'Ambitious Coach',
    description_ar = 'للمدرب اللي عدد عملائه بيزيد',
    description_en = 'For coaches with a growing roster',
    price_egp_monthly = 999,
    max_clients = 100,
    max_team_members = 2,
    features = '{"white_label": true, "forms_builder": true, "custom_library": true, "custom_branding": true, "task_management": true, "priority_support": false}'::jsonb,
    is_active = true
where key = 'pro';

-- The old Studio row becomes the entry Pro Coach tier (150 clients).
update public.subscription_tiers
set name_ar = 'مدرب محترف',
    name_en = 'Pro Coach',
    description_ar = 'لشغل تدريب كبير وفريق معاه',
    description_en = 'Built for growing coaching businesses',
    price_egp_monthly = 1999,
    max_clients = 150,
    max_team_members = 3,
    features = '{"white_label": true, "forms_builder": true, "custom_library": true, "custom_branding": true, "task_management": true, "priority_support": true}'::jsonb,
    is_active = true
where key = 'elite';

-- null = no cap (max_clients / max_team_members).
insert into public.subscription_tiers
  (key, name_ar, name_en, description_ar, description_en, price_egp_monthly, max_clients, max_team_members, features, is_active)
select 'elite', 'مدرب محترف', 'Pro Coach', 'لشغل تدريب كبير وفريق معاه', 'Built for growing coaching businesses',
       v.price, v.clients, v.seats,
       '{"white_label": true, "forms_builder": true, "custom_library": true, "custom_branding": true, "task_management": true, "priority_support": true}'::jsonb,
       true
from (values
  (2999,  250,   3),
  (4999,  500,   5),
  (6999,  1000,  7),
  (9999,  2000,  10),
  (14999, 5000,  20),
  (17999, 10000, 30),
  (19999, null::int, null::int)
) as v(price, clients, seats);

-- Studio coaches were unlimited (and carried the old 999999 sentinel).
-- Moving them to the unlimited Pro Coach tier keeps their limits as they were
-- instead of silently capping them at 150.
update public.subscriptions
set tier_id = (select id from public.subscription_tiers where key = 'elite' and max_clients is null)
where tier_id = (select id from public.subscription_tiers where key = 'elite' and max_clients = 150);

-- Same as 20261017000002 plus a lock on the subscription row, as
-- enforce_team_cap already has: two inserts at once can no longer both read
-- the same count and both fit under the cap.
create or replace function private.enforce_client_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
  v_count int;
begin
  if not private.coach_has_access(new.coach_id) then
    raise exception 'An active subscription is required to add clients.'
      using errcode = 'P0001', hint = 'subscription_inactive';
  end if;

  select t.max_clients into v_max
  from public.subscriptions s
  join public.subscription_tiers t on t.id = s.tier_id
  where s.coach_id = new.coach_id
  for update of s;

  if v_max is null then
    return new;
  end if;

  select count(*) into v_count
  from public.clients
  where coach_id = new.coach_id and status <> 'archived';

  if v_count >= v_max then
    raise exception 'Client limit reached for your current plan.' using errcode = '23514';
  end if;

  return new;
end;
$$;
