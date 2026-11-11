-- Coach weight history. workout_set_logs never stored which exercise a set
-- was for: it's coalesce(substituted_exercise_id, program_items.exercise_id),
-- which needs a join on every read and can't be indexed or filtered on.
-- Stamp it on the row (trigger-owned, never trusted from the caller, same
-- rule as stamp_relationship_id in 20260930000004_coaching_relationships.sql)
-- so history can be filtered per exercise and paged by date.
--
-- No RLS change: coach_read (relationship_id in visible_relationship_ids())
-- already limits a coach to the clients they coach (plus ended relationships
-- the client chose to share); client_own is unchanged.

alter table public.workout_set_logs
  add column exercise_id uuid references public.exercises (id);

-- The immutability trigger fires for every role (including this migration),
-- so it would reject the backfill of rows older than 7 days.
alter table public.workout_set_logs disable trigger workout_set_logs_reject_stale_edit;

update public.workout_set_logs l
set exercise_id = coalesce(l.substituted_exercise_id, pi.exercise_id)
from public.program_items pi
where pi.id = l.program_item_id;

alter table public.workout_set_logs enable trigger workout_set_logs_reject_stale_edit;

create function private.stamp_set_log_exercise_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.exercise_id := coalesce(
    new.substituted_exercise_id,
    (select exercise_id from public.program_items where id = new.program_item_id)
  );
  return new;
end;
$$;

create trigger workout_set_logs_stamp_exercise
  before insert or update on public.workout_set_logs
  for each row execute function private.stamp_set_log_exercise_id();

create index workout_set_logs_client_exercise_idx
  on public.workout_set_logs (client_id, exercise_id, completed_at desc);

-- Best set (heaviest weight, then most reps) per exercise in a date range,
-- aggregated in SQL so it isn't truncated by PostgREST's max-rows cap.
-- security invoker: the caller's RLS on workout_set_logs decides which rows
-- count, so a coach passing someone else's client_id just gets nothing back.
create function public.exercise_bests(p_client_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (
  exercise_id uuid,
  best_weight numeric,
  best_reps int,
  best_at timestamptz,
  set_count bigint,
  last_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (l.exercise_id)
    l.exercise_id,
    l.weight,
    l.reps,
    l.completed_at,
    count(*) over (partition by l.exercise_id),
    max(l.completed_at) over (partition by l.exercise_id)
  from public.workout_set_logs l
  where l.client_id = p_client_id
    and l.exercise_id is not null
    and (p_from is null or l.completed_at >= p_from)
    and (p_to is null or l.completed_at < p_to)
  order by l.exercise_id, l.weight desc nulls last, l.reps desc nulls last
$$;

revoke execute on function public.exercise_bests(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.exercise_bests(uuid, timestamptz, timestamptz) to authenticated;
