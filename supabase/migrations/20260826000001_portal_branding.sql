-- White-label portal: a coach's slug (auto-generated as an opaque
-- coach-<uuid> at signup, see 20260731000003_coaches.sql) becomes
-- human-editable now that it's shown in a shareable subdomain URL. Format
-- constraint added now that a human types it -- lowercase alphanumeric with
-- internal hyphens, 3-40 chars, matching the shape a DNS label allows.
alter table public.coaches
  add constraint coaches_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$');

-- The branded subdomain's login page is anonymous and RLS locks out
-- `coaches` for that role entirely -- this is the one narrow read it's
-- allowed: just the business name a branded login page shows before
-- anyone signs in. Mirrors get_invite_info()'s narrow-safe-subset pattern
-- in 20260731000012_invite_info.sql exactly.
create function public.get_portal_branding(p_slug text)
returns json
language sql
security definer
stable
set search_path = ''
as $$
  select json_build_object('business_name', business_name)
  from public.coaches
  where slug = p_slug;
$$;

revoke execute on function public.get_portal_branding(text) from public;
grant execute on function public.get_portal_branding(text) to anon, authenticated;
