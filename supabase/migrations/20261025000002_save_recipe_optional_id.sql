-- save_recipe (20261025000001) took p_id first, without a default. Callers
-- create by passing null, but the generated types mark the argument as a
-- required string, and omitting it from the call body makes PostgREST find
-- no matching function. Moving it last with `default null`, like
-- accept_invite's p_ip, makes "omit p_id" mean "create". Body unchanged.

drop function public.save_recipe(uuid, jsonb, jsonb);

create function public.save_recipe(p_recipe jsonb, p_ingredients jsonb, p_id uuid default null)
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

revoke execute on function public.save_recipe(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_recipe(jsonb, jsonb, uuid) to authenticated;
