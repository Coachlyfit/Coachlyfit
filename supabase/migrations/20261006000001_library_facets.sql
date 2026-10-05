-- Library facets: per-muscle-group / per-category counts for the coach
-- library's tab badges and chip row, in one grouped query per tab instead of
-- one count query per chip.
--
-- security invoker over exercises_visible/foods_visible (themselves
-- security_invoker, 20260805000001), so the caller's RLS decides which rows
-- are counted exactly as it does for the list itself — no new policy.
--
-- The predicates mirror LibraryService.searchExercises/searchFoods
-- (src/domain/library/library.service.ts): same source rule as applySource,
-- same two-column name match. The group/category filter is deliberately NOT
-- a parameter — a chip's count has to say how many rows picking it would
-- show, not how many the current pick already shows.
--
-- p_query arrives already stripped of PostgREST filter syntax by the service;
-- `_` stays an ilike wildcard here just as it is in the list query.
create function public.library_exercise_facets(
  p_query text default '',
  p_source text default 'all',
  p_equipment text default null
)
returns table (grp text, n bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.muscle_group, count(*)
  from public.exercises_visible e
  where e.archived_at is null
    and case p_source
          when 'global' then e.coach_id is null
          when 'mine' then e.coach_id is not null
          else e.my_clone_id is null
        end
    and (p_equipment is null or e.equipment = p_equipment)
    and (
      coalesce(p_query, '') = ''
      or e.name_ar ilike '%' || p_query || '%'
      or e.name_en ilike '%' || p_query || '%'
    )
  group by e.muscle_group;
$$;

create function public.library_food_facets(
  p_query text default '',
  p_source text default 'all'
)
returns table (grp text, n bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.category, count(*)
  from public.foods_visible f
  where case p_source
          when 'global' then f.coach_id is null
          when 'mine' then f.coach_id is not null
          else f.my_clone_id is null
        end
    and (
      coalesce(p_query, '') = ''
      or f.name_ar ilike '%' || p_query || '%'
      or f.name_en ilike '%' || p_query || '%'
    )
  group by f.category;
$$;

revoke execute on function public.library_exercise_facets(text, text, text) from public;
revoke execute on function public.library_food_facets(text, text) from public;
grant execute on function public.library_exercise_facets(text, text, text) to authenticated;
grant execute on function public.library_food_facets(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Equipment cleanup (global rows only)
-- ---------------------------------------------------------------------------
-- equipment is free text with no constraint; the seeds left 'Machine',
-- 'Machine ' and 'machine' as three values, and 'resistance band' next to
-- 'band'. The new equipment filter is a plain equality on the vocabulary in
-- src/domain/library/taxonomy.ts, so the curated rows have to actually use
-- it. Coach-owned rows are left alone — that text is theirs.
update public.exercises
set equipment = lower(btrim(equipment))
where coach_id is null
  and equipment is not null
  and equipment <> lower(btrim(equipment));

update public.exercises
set equipment = 'band'
where coach_id is null
  and equipment = 'resistance band';
