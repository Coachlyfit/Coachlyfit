-- The "coming soon" page should wear the coach's own colors. An unpublished
-- site returns no content (by design), but its color theme is just branding,
-- so return that one part of the draft. Nothing else about the draft leaks.
create or replace function public.get_public_site(p_key text)
returns json
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_key text := lower(trim(p_key));
  v_site public.coach_sites%rowtype;
  v_coach public.coaches%rowtype;
  v_branded boolean;
  v_coach_json json;
begin
  select s.* into v_site
  from public.coach_sites s
  join public.coaches c on c.id = s.coach_id
  where (s.domain = v_key or c.slug = v_key) and c.archived_at is null
  limit 1;

  if v_site.id is null then
    return null;
  end if;

  select * into v_coach from public.coaches where id = v_site.coach_id;
  v_branded := private.coach_has_feature(v_coach.id, 'custom_branding');

  v_coach_json := json_build_object(
    'business_name', v_coach.business_name,
    'slug', v_coach.slug,
    'logo_path', case when v_branded then v_coach.logo_path end,
    'brand_primary', case when v_branded then v_coach.brand_primary end,
    'brand_accent', case when v_branded then v_coach.brand_accent end
  );

  if not v_site.is_published or v_site.published_content is null then
    return json_build_object(
      'is_published', false,
      'domain', v_site.domain,
      'coach', v_coach_json,
      'theme', v_site.draft->'theme'
    );
  end if;

  return json_build_object(
    'is_published', true,
    'domain', v_site.domain,
    'published_at', v_site.published_at,
    'content', v_site.published_content,
    'coach', v_coach_json,
    'results', coalesce((
      select json_agg(json_build_object(
        'id', sr.card_id,
        'before_path', sr.before_path,
        'after_path', sr.after_path,
        'duration_days', pc.duration_days,
        'weight_delta', pc.weight_delta
      ) order by pc.created_at desc)
      from public.site_results sr
      join public.progress_cards pc on pc.id = sr.card_id
      join public.card_consents cc on cc.card_id = sr.card_id
      where sr.site_id = v_site.id
        and sr.is_published
        and cc.status = 'agreed'
        and sr.before_path is not null
        and sr.after_path is not null
    ), '[]'::json),
    'reviews', coalesce((
      select json_agg(x) from (
        select json_build_object(
          'id', r.id,
          'rating', r.rating,
          'body', r.body,
          'display_name', r.display_name,
          'created_at', r.created_at
        ) as x
        from public.reviews r
        where r.coach_id = v_site.coach_id and r.status = 'approved'
        order by r.created_at desc
        limit 12
      ) q
    ), '[]'::json)
  );
end;
$$;

revoke execute on function public.get_public_site(text) from public;
grant execute on function public.get_public_site(text) to anon, authenticated;
