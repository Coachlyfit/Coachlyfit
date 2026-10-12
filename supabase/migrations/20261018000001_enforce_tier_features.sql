-- forms_builder, custom_library and white_label were sold on the pricing page
-- but nothing checked them; only custom_branding was enforced (20261011000001).
--
-- Existing content is kept: nothing here touches rows that already exist. A
-- coach without the flag keeps using, editing and assigning what they have;
-- what needs the flag is making something new. So these are insert triggers
-- (and, on coaches, a guard on changing the value), not policies -- and being
-- triggers they also cover any security definer path. Same error shape as
-- private.guard_coach_branding: P0001 with hint 'upgrade_required', which the
-- server actions map to an upgrade prompt.
--
--   forms_builder   creating (or duplicating) a form template, past the
--                   first one (see require_forms_builder below)
--   custom_library  adding or cloning a coach-owned exercise / food
--   white_label     setting a logo (invoices) or a custom portal address
--   priority_support stays display-only.

create function private.require_feature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- tg_argv[0] is the feature key. Global library rows (coach_id is null)
  -- are admin-curated and belong to no plan.
  if new.coach_id is not null and not private.coach_has_feature(new.coach_id, tg_argv[0]) then
    raise exception '% requires a plan that includes it', tg_argv[0]
      using errcode = 'P0001', hint = 'upgrade_required';
  end if;
  return new;
end;
$$;

-- A coach's first template is free on every plan: onboarding offers each new
-- coach a starter form (createStarterTemplateAction), and a new coach is on
-- the cheapest tier's trial, which has no forms_builder. Without this the
-- onboarding step would fail for everyone. Archived templates still count,
-- so archiving doesn't hand out another free one.
create function private.require_forms_builder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.form_templates where coach_id = new.coach_id)
     and not private.coach_has_feature(new.coach_id, 'forms_builder') then
    raise exception 'forms_builder requires a plan that includes it'
      using errcode = 'P0001', hint = 'upgrade_required';
  end if;
  return new;
end;
$$;

create trigger form_templates_require_feature
  before insert on public.form_templates
  for each row execute function private.require_forms_builder();

create trigger exercises_require_feature
  before insert on public.exercises
  for each row execute function private.require_feature('custom_library');

create trigger foods_require_feature
  before insert on public.foods
  for each row execute function private.require_feature('custom_library');

-- Clearing the logo and going back to the generated address are always
-- allowed; keeping the current value is not a change and doesn't fire the
-- check, so a logo or address set before this migration stays.
create function private.guard_coach_white_label()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.logo_path is distinct from old.logo_path and new.logo_path is not null)
     or (new.slug is distinct from old.slug
         and new.slug <> 'coach-' || replace(new.id::text, '-', '')) then
    if not private.coach_has_feature(new.id, 'white_label') then
      raise exception 'white_label requires a plan that includes it'
        using errcode = 'P0001', hint = 'upgrade_required';
    end if;
  end if;
  return new;
end;
$$;

create trigger coaches_guard_white_label
  before update of logo_path, slug on public.coaches
  for each row execute function private.guard_coach_white_label();

-- The caller's tenant's feature flags, for the UI to hide or disable what
-- the plan doesn't include. {} when the subscription has lapsed, matching
-- coach_has_feature. Display only: the triggers above are the enforcement.
create function public.get_my_features()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (
      select t.features
      from public.subscriptions s
      join public.subscription_tiers t on t.id = s.tier_id
      where s.coach_id = (select private.coach_id())
        and s.status in ('trialing', 'active', 'past_due')
    ),
    '{}'::jsonb
  );
$$;

revoke execute on function public.get_my_features() from public, anon;
grant execute on function public.get_my_features() to authenticated;
