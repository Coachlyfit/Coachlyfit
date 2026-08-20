-- Powers the food library's kanban view (grouped by category) the same way
-- exercises already group by muscle_group. No RLS changes needed: the
-- existing update_own policy on foods already covers this column.
alter table public.foods
  add column category text not null default 'other'
    check (category in ('protein', 'carbs', 'fats', 'vegetables', 'fruits', 'dairy', 'other'));
