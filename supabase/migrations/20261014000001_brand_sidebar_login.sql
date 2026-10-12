-- Brand theming, round two (Studio tier, see 20261011000001_coach_branding.sql):
--   * two more colors: the coach nav's ground and its text
--   * the coach's logo on their branded sign-in page
-- Same gating as before: the trigger guards writes, the RPCs guard reads.

alter table public.coaches
  add column brand_sidebar text,
  add column brand_sidebar_text text,
  add constraint coaches_brand_sidebar_format check (brand_sidebar ~ '^#[0-9a-f]{6}$'),
  add constraint coaches_brand_sidebar_text_format check (brand_sidebar_text ~ '^#[0-9a-f]{6}$');

create or replace function private.guard_coach_branding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.brand_primary is distinct from old.brand_primary and new.brand_primary is not null)
     or (new.brand_accent is distinct from old.brand_accent and new.brand_accent is not null)
     or (new.brand_sidebar is distinct from old.brand_sidebar and new.brand_sidebar is not null)
     or (new.brand_sidebar_text is distinct from old.brand_sidebar_text and new.brand_sidebar_text is not null) then
    if not private.coach_has_feature(new.id, 'custom_branding') then
      raise exception 'custom_branding requires a plan that includes it'
        using errcode = 'P0001', hint = 'upgrade_required';
    end if;
  end if;
  return new;
end;
$$;

-- The column list is part of the trigger, so it has to be recreated to fire
-- on the new columns.
drop trigger coaches_guard_branding on public.coaches;
create trigger coaches_guard_branding
  before update of brand_primary, brand_accent, brand_sidebar, brand_sidebar_text on public.coaches
  for each row execute function private.guard_coach_branding();

-- Same function as 20261011000001, plus the two sidebar colors. `create or
-- replace` keeps its grants (authenticated only).
create or replace function public.get_my_branding()
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
    'sidebar', c.brand_sidebar,
    'sidebar_text', c.brand_sidebar_text,
    'logo_path', c.logo_path,
    'business_name', c.business_name
  )
  from target
  join public.coaches c on c.id = target.coach_id
  where private.coach_has_feature(c.id, 'custom_branding');
$$;

-- The anonymous sign-in page read (20260826000001_portal_branding.sql) now
-- also carries the logo, but only for plans with custom branding; everyone
-- else still gets just the business name. The logo itself already lives in a
-- public bucket. Grants (anon, authenticated) carry over.
create or replace function public.get_portal_branding(p_slug text)
returns json
language sql
security definer
stable
set search_path = ''
as $$
  select json_build_object(
    'business_name', business_name,
    'logo_path', case when private.coach_has_feature(id, 'custom_branding') then logo_path end
  )
  from public.coaches
  where slug = p_slug;
$$;
