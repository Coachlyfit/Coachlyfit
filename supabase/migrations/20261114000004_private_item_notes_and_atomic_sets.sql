-- Two fixes found in the plan-type audit.
--
-- 1. coach_note_private was hidden from clients only because every client-facing
--    query left the column out of its select list. RLS is row-level
--    (client_read_own on program_items), so a client calling the API directly
--    could `select coach_note_private`. The note moves to its own table whose
--    policy only a coach passes. This migration is additive (new table + a copy
--    of the data); the old column is dropped separately in 20261114000005 once
--    the app no longer reads or writes it.
--
-- 2. Replacing an item's sets was delete-then-insert over two requests, so a
--    failed insert wiped the item's sets. replace_program_item_sets does it in
--    one transaction.

-- 1. Coach-only note ---------------------------------------------------------
create table public.program_item_notes (
  program_item_id uuid primary key references public.program_items(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 1000),
  updated_at timestamptz not null default now()
);

alter table public.program_item_notes enable row level security;

-- Only a coach passes `coach_id = private.coach_id()` (it is null for a client
-- or an admin). Which items that coach may touch is whatever program_items'
-- own policies let them see, so team-member scoping is inherited, not copied.
create policy coach_rw on public.program_item_notes
  for all to authenticated
  using (
    coach_id = (select private.coach_id())
    and exists (select 1 from public.program_items pi where pi.id = program_item_id)
  )
  with check (
    coach_id = (select private.coach_id())
    and exists (select 1 from public.program_items pi where pi.id = program_item_id)
  );

insert into public.program_item_notes (program_item_id, coach_id, note)
select id, coach_id, left(btrim(coach_note_private), 1000)
from public.program_items
where coach_note_private is not null and btrim(coach_note_private) <> ''
on conflict (program_item_id) do nothing;

-- 2. Atomic set replacement ---------------------------------------------------
-- SECURITY INVOKER (the default): every statement runs under the caller's RLS,
-- so a coach can only replace the sets of an item they can already write.
-- p_sets is an ordered array of set objects (same keys as program_item_sets
-- columns); p_legacy carries the sets/reps/rest_seconds snapshot kept on
-- program_items for older readers. Returns false when the item is not visible.
create or replace function public.replace_program_item_sets(
  p_item_id uuid,
  p_sets jsonb,
  p_legacy jsonb default null
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_coach uuid;
  v_client uuid;
begin
  select coach_id, client_id into v_coach, v_client
  from public.program_items where id = p_item_id;
  if not found then
    return false;
  end if;

  if p_legacy is not null then
    update public.program_items
       set sets = coalesce((p_legacy->>'sets')::int, sets),
           reps = coalesce(p_legacy->>'reps', reps),
           rest_seconds = nullif(p_legacy->>'rest_seconds', '')::int
     where id = p_item_id;
  end if;

  delete from public.program_item_sets where program_item_id = p_item_id;

  insert into public.program_item_sets
    (coach_id, client_id, program_item_id, set_index, reps, weight, rest_seconds,
     duration_seconds, distance_m, calories, extra, set_type, reps_max, pct_1rm,
     rpe_target, rir_target)
  select
    v_coach, v_client, p_item_id, t.ord::int,
    nullif(t.e->>'reps', '')::int,
    nullif(t.e->>'weight', '')::numeric,
    nullif(t.e->>'rest_seconds', '')::int,
    nullif(t.e->>'duration_seconds', '')::int,
    nullif(t.e->>'distance_m', '')::numeric,
    nullif(t.e->>'calories', '')::int,
    case when jsonb_typeof(t.e->'extra') = 'object' then t.e->'extra' end,
    coalesce(nullif(t.e->>'set_type', ''), 'working'),
    nullif(t.e->>'reps_max', '')::int,
    nullif(t.e->>'pct_1rm', '')::numeric,
    nullif(t.e->>'rpe_target', '')::numeric,
    nullif(t.e->>'rir_target', '')::smallint
  from jsonb_array_elements(p_sets) with ordinality as t(e, ord);

  return true;
end;
$$;

revoke all on function public.replace_program_item_sets(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.replace_program_item_sets(uuid, jsonb, jsonb) to authenticated;
