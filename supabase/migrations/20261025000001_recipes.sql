-- Recipes: coach-owned dishes built from the food library, addable to a
-- meal plan alongside single foods. Macros are never stored; they're derived
-- from the ingredients' foods (recipes_with_macros below, and the TS twin
-- calculateRecipeNutrition in src/domain/recipes/recipe-nutrition.ts).
--
-- No updated_at: like the rest of this schema (see 20260805000001), nothing
-- here needs to know when a row last changed.

-- ---------------------------------------------------------------------------
-- Helpers

-- Every element of a text[] within [p_min, p_max] chars, for CHECKs (which
-- can't hold a subquery themselves). An empty array passes.
create function private.text_items_within(p_items text[], p_min int, p_max int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(char_length(i) between p_min and p_max), true)
  from unnest(p_items) as i;
$$;

-- How many of the food's own stored serving an ingredient amounts to.
-- 'serving' is a plain multiple. 'g'/'ml' only work when serving_label is a
-- plain gram/ml amount ("100g", "250 ml"), the same regex formatServing uses
-- (src/domain/nutrition/macros.ts): 150 g of a "100g" food is 1.5. Anything
-- else returns null, which the sums below skip. Keep in sync with
-- servingFactor() in src/domain/recipes/recipe-nutrition.ts.
create function private.serving_factor(p_quantity numeric, p_unit text, p_serving_label text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_unit = 'serving' then p_quantity
    else (
      select p_quantity / nullif(t.m[1]::numeric, 0)
      from regexp_match(btrim(coalesce(p_serving_label, '')), '^(\d+(?:\.\d+)?)\s*(g|ml)$', 'i') as t(m)
      where lower(t.m[2]) = p_unit
    )
  end;
$$;

revoke execute on function private.text_items_within(text[], int, int) from public;
revoke execute on function private.serving_factor(numeric, text, text) from public;
grant execute on function private.text_items_within(text[], int, int) to authenticated, service_role;
grant execute on function private.serving_factor(numeric, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tables. Limits mirror src/domain/recipes/recipe.schema.ts.

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  name_ar text not null check (char_length(btrim(name_ar)) between 2 and 80),
  name_en text not null check (char_length(btrim(name_en)) between 2 and 80),
  description text check (char_length(description) <= 300),
  servings int not null default 1 check (servings between 1 and 20),
  prep_minutes int check (prep_minutes between 0 and 600),
  cook_minutes int check (cook_minutes between 0 and 600),
  steps text[] not null default '{}'
    check (cardinality(steps) <= 30 and private.text_items_within(steps, 3, 500)),
  tags text[] not null default '{}'
    check (cardinality(tags) <= 8 and private.text_items_within(tags, 1, 24)),
  video_url text check (video_url ~ '^https://' and char_length(video_url) <= 500),
  -- Must sit in the owner's own folder: the client storage policy below
  -- trusts image_path, so a coach pointing it at another coach's file would
  -- otherwise hand that file to their own clients.
  image_path text check (image_path like coach_id::text || '/%' and char_length(image_path) <= 300),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index recipes_coach_id_idx on public.recipes (coach_id);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  -- restrict: a food used in a recipe can't be deleted (libraryErrorKey maps
  -- the 23503 to in_use, same as a food used in a meal).
  food_id uuid not null references public.foods (id) on delete restrict,
  quantity numeric(8, 2) not null check (quantity > 0 and quantity <= 5000),
  unit text not null default 'serving' check (unit in ('serving', 'g', 'ml')),
  position int not null check (position >= 0),
  note text check (char_length(note) <= 60),
  unique (recipe_id, position)
);

create index recipe_ingredients_food_id_idx on public.recipe_ingredients (food_id);

-- A meal item is now a food or a recipe, never both. For a recipe,
-- quantity is the number of recipe servings (unit 'serving'), the same
-- "multiple of one serving" meaning it already has for foods. No action on
-- delete: a recipe in any plan can't be hard-deleted, the app archives it.
alter table public.meal_items
  alter column food_id drop not null,
  add column recipe_id uuid references public.recipes (id),
  add constraint meal_items_food_or_recipe check (num_nonnulls(food_id, recipe_id) = 1);

create index meal_items_recipe_id_idx on public.meal_items (recipe_id);

-- ---------------------------------------------------------------------------
-- Client access helpers. Security definer so the policies below call a
-- function instead of a sublink: a foods policy reading recipe_ingredients
-- while recipe_ingredients' with-check reads foods would otherwise trip
-- "infinite recursion detected in policy" on every ingredient insert.

-- Recipes in any of the caller's meal items. Same scope as
-- foods.client_read_assigned (20260930000004): archived plans included, so
-- plan history keeps rendering.
create function private.client_recipe_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select distinct mi.recipe_id
  from public.meal_items mi
  where mi.client_id = (select private.client_id())
    and mi.recipe_id is not null;
$$;

create function private.client_recipe_food_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select distinct ri.food_id
  from public.recipe_ingredients ri
  where ri.recipe_id in (select private.client_recipe_ids());
$$;

revoke execute on function private.client_recipe_ids() from public;
revoke execute on function private.client_recipe_food_ids() from public;
grant execute on function private.client_recipe_ids() to authenticated;
grant execute on function private.client_recipe_food_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

revoke all on public.recipes from anon, authenticated;
revoke all on public.recipe_ingredients from anon, authenticated;
grant select, insert, update, delete on public.recipes to authenticated, service_role;
grant select, insert, update, delete on public.recipe_ingredients to authenticated, service_role;

create policy coach_rw on public.recipes for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));

create policy client_read_assigned on public.recipes for select to authenticated
  using (id in (select private.client_recipe_ids()));

-- The food has to be one the coach can see (own or global; foods RLS does
-- the filtering), so a recipe can't reach into another coach's library.
create policy coach_rw on public.recipe_ingredients for all to authenticated
  using (recipe_id in (select r.id from public.recipes r where r.coach_id = (select private.coach_id())))
  with check (
    recipe_id in (select r.id from public.recipes r where r.coach_id = (select private.coach_id()))
    and food_id in (select f.id from public.foods f)
  );

create policy client_read_assigned on public.recipe_ingredients for select to authenticated
  using (recipe_id in (select private.client_recipe_ids()));

create policy client_read_recipe_foods on public.foods for select to authenticated
  using (id in (select private.client_recipe_food_ids()));

-- Same subscription guard as every other coach-written table (20261017000002).
do $$
declare
  t text;
begin
  foreach t in array array['recipes', 'recipe_ingredients']
  loop
    execute format(
      'create policy coach_access_insert on public.%I as restrictive for insert to authenticated
         with check ((select private.coach_id()) is null
                     or (select private.coach_has_access((select private.coach_id()))))', t
    );
    execute format(
      'create policy coach_access_update on public.%I as restrictive for update to authenticated
         with check ((select private.coach_id()) is null
                     or (select private.coach_has_access((select private.coach_id()))))', t
    );
  end loop;
end $$;

-- A meal item may only point at the coach's own recipe. The FK alone would
-- accept any recipe id, and client_recipe_ids() would then expose another
-- coach's recipe to this coach's client.
create policy own_recipe_insert on public.meal_items as restrictive for insert to authenticated
  with check (recipe_id is null or recipe_id in (
    select r.id from public.recipes r where r.coach_id = (select private.coach_id())
  ));

create policy own_recipe_update on public.meal_items as restrictive for update to authenticated
  with check (recipe_id is null or recipe_id in (
    select r.id from public.recipes r where r.coach_id = (select private.coach_id())
  ));

-- ---------------------------------------------------------------------------
-- Library read model: per-serving macros (unrounded) for sorting by kcal,
-- and how many non-archived plans use each recipe. Invoker, so RLS on every
-- table still applies. r.* is frozen at creation: a migration adding a
-- column to recipes must `create or replace` this view too.

create view public.recipes_with_macros with (security_invoker = true) as
select
  r.*,
  coalesce(m.kcal, 0) / r.servings as kcal,
  coalesce(m.protein_g, 0) / r.servings as protein_g,
  coalesce(m.carb_g, 0) / r.servings as carb_g,
  coalesce(m.fat_g, 0) / r.servings as fat_g,
  coalesce(r.prep_minutes, 0) + coalesce(r.cook_minutes, 0) as total_minutes,
  (
    select count(distinct ml.diet_plan_id)
    from public.meal_items mi
    join public.meals ml on ml.id = mi.meal_id
    join public.diet_plans dp on dp.id = ml.diet_plan_id
    where mi.recipe_id = r.id and dp.archived_at is null
  )::int as plan_count
from public.recipes r
left join lateral (
  select
    sum(f.kcal * private.serving_factor(ri.quantity, ri.unit, f.serving_label)) as kcal,
    sum(f.protein_g * private.serving_factor(ri.quantity, ri.unit, f.serving_label)) as protein_g,
    sum(f.carb_g * private.serving_factor(ri.quantity, ri.unit, f.serving_label)) as carb_g,
    sum(f.fat_g * private.serving_factor(ri.quantity, ri.unit, f.serving_label)) as fat_g
  from public.recipe_ingredients ri
  join public.foods f on f.id = ri.food_id
  where ri.recipe_id = r.id
) m on true;

revoke all on public.recipes_with_macros from anon;
grant select on public.recipes_with_macros to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Save a recipe and its full ingredient list in one transaction, so an edit
-- that fails halfway can't leave a recipe with its ingredients deleted.
-- Invoker: every write goes through the policies above. p_id null creates.

create function public.save_recipe(p_id uuid, p_recipe jsonb, p_ingredients jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_steps text[] := coalesce(array(select jsonb_array_elements_text(p_recipe -> 'steps')), '{}');
  v_tags text[] := coalesce(array(select jsonb_array_elements_text(p_recipe -> 'tags')), '{}');
begin
  if jsonb_typeof(p_ingredients) <> 'array' or jsonb_array_length(p_ingredients) not between 1 and 40 then
    raise exception 'A recipe needs between 1 and 40 ingredients.'
      using errcode = '23514', hint = 'ingredients_count';
  end if;

  if p_id is null then
    insert into public.recipes (
      coach_id, name_ar, name_en, description, servings, prep_minutes, cook_minutes,
      steps, tags, video_url, image_path
    ) values (
      (select private.coach_id()),
      p_recipe ->> 'name_ar',
      p_recipe ->> 'name_en',
      p_recipe ->> 'description',
      (p_recipe ->> 'servings')::int,
      (p_recipe ->> 'prep_minutes')::int,
      (p_recipe ->> 'cook_minutes')::int,
      v_steps,
      v_tags,
      p_recipe ->> 'video_url',
      p_recipe ->> 'image_path'
    )
    returning id into v_id;
  else
    update public.recipes set
      name_ar = p_recipe ->> 'name_ar',
      name_en = p_recipe ->> 'name_en',
      description = p_recipe ->> 'description',
      servings = (p_recipe ->> 'servings')::int,
      prep_minutes = (p_recipe ->> 'prep_minutes')::int,
      cook_minutes = (p_recipe ->> 'cook_minutes')::int,
      steps = v_steps,
      tags = v_tags,
      video_url = p_recipe ->> 'video_url',
      image_path = p_recipe ->> 'image_path'
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Recipe not found.' using errcode = '42501', hint = 'not_found_or_forbidden';
    end if;

    delete from public.recipe_ingredients where recipe_id = v_id;
  end if;

  insert into public.recipe_ingredients (recipe_id, food_id, quantity, unit, position, note)
  select v_id, (i ->> 'food_id')::uuid, (i ->> 'quantity')::numeric, i ->> 'unit', (o - 1)::int,
         nullif(btrim(i ->> 'note'), '')
  from jsonb_array_elements(p_ingredients) with ordinality as t(i, o);

  return v_id;
end;
$$;

revoke execute on function public.save_recipe(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_recipe(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage. Private bucket, path coach_id/<uuid>.webp. Every file gets a fresh
-- name, so there's no update policy; replacing an image is insert + delete.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']);

-- private.coach_id() resolves a team member to the owning coach, so the
-- whole team shares the folder, same as the recipes themselves.
create policy recipe_images_coach_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

create policy recipe_images_coach_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

create policy recipe_images_coach_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

-- recipes RLS narrows the sublink to recipes the client may read.
create policy recipe_images_client_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recipe-images'
    and name in (select r.image_path from public.recipes r where r.image_path is not null)
  );
