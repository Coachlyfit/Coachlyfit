-- Coach brand theming (Studio tier): a coach picks a primary + accent color,
-- and those colors plus their existing invoice logo (coaches.logo_path) skin
-- the app for the coach, their team, and their clients.
--
-- Gating lives in the database, not just the UI:
--   * writes: a trigger rejects setting brand colors unless the coach's tier
--     has the `custom_branding` feature flag (clearing them is always allowed)
--   * reads: get_my_branding() returns null when the tier lacks the flag, so
--     a downgraded coach silently falls back to the default theme while the
--     saved colors stay on the row for if they upgrade again.

alter table public.coaches
  add column brand_primary text,
  add column brand_accent text,
  add constraint coaches_brand_primary_format check (brand_primary ~ '^#[0-9a-f]{6}$'),
  add constraint coaches_brand_accent_format check (brand_accent ~ '^#[0-9a-f]{6}$');

-- New tier flag. Studio (key 'elite') only; admins can toggle it per tier in
-- admin settings like the other flags.
update public.subscription_tiers
set features = features || jsonb_build_object('custom_branding', key = 'elite');

-- Whether a coach's current subscription grants a feature flag. Canceled
-- subscriptions grant nothing; trialing/active/past_due keep the tier's flags
-- (past_due is the grace window the billing cron already gives).
create function private.coach_has_feature(p_coach_id uuid, p_feature text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (
      select (t.features ->> p_feature)::boolean
      from public.subscriptions s
      join public.subscription_tiers t on t.id = s.tier_id
      where s.coach_id = p_coach_id
        and s.status in ('trialing', 'active', 'past_due')
    ),
    false
  );
$$;

revoke execute on function private.coach_has_feature(uuid, text) from public;

create function private.guard_coach_branding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.brand_primary is distinct from old.brand_primary and new.brand_primary is not null)
     or (new.brand_accent is distinct from old.brand_accent and new.brand_accent is not null) then
    if not private.coach_has_feature(new.id, 'custom_branding') then
      raise exception 'custom_branding requires a plan that includes it'
        using errcode = 'P0001', hint = 'upgrade_required';
    end if;
  end if;
  return new;
end;
$$;

create trigger coaches_guard_branding
  before update of brand_primary, brand_accent on public.coaches
  for each row execute function private.guard_coach_branding();

-- The caller's effective branding: their own tenant if they're a coach or
-- team member, otherwise the coach of their active coaching relationship.
-- Returns only the narrow display subset, and null when the tier lacks the
-- flag.
create function public.get_my_branding()
returns json
language sql
security definer
stable
set search_path = ''
as $$
  with target as (
    select coalesce(
      (select private.coach_id()),
      (
        select r.coach_id from public.coaching_relationships r
        where r.client_id = (select private.client_id()) and r.status = 'active'
      )
    ) as coach_id
  )
  select json_build_object(
    'primary', c.brand_primary,
    'accent', c.brand_accent,
    'logo_path', c.logo_path,
    'business_name', c.business_name
  )
  from target
  join public.coaches c on c.id = target.coach_id
  where private.coach_has_feature(c.id, 'custom_branding');
$$;

-- anon is named explicitly: Supabase's default privileges grant it EXECUTE
-- directly, so revoking from public alone leaves the RPC callable signed out
-- (see 20260930000005).
revoke execute on function public.get_my_branding() from public, anon;
grant execute on function public.get_my_branding() to authenticated;
