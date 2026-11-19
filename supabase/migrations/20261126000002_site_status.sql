-- The proxy needs more than "does a site row exist": a coach's white-label
-- subdomain root must keep serving the platform until the site is published,
-- while a custom domain shows "coming soon" for an unpublished site.
drop function public.site_exists(text);

create function public.site_status(p_key text)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce((
    select case when s.is_published and s.published_content is not null
                then 'published' else 'unpublished' end
    from public.coach_sites s
    join public.coaches c on c.id = s.coach_id
    where (s.domain = lower(trim(p_key)) or c.slug = lower(trim(p_key)))
      and c.archived_at is null
    limit 1
  ), 'none');
$$;

revoke execute on function public.site_status(text) from public;
grant execute on function public.site_status(text) to anon, authenticated;
