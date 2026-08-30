-- Session-level exercise substitution: a client swapping a prescribed
-- exercise for something else (equipment taken, injury, no access) without
-- ever mutating the coach-authored prescription. null (every existing row,
-- and the default for every future one) means the set was logged against
-- the prescribed exercise, same as before this column existed. Same
-- "references, never mutates" relationship to program_items that this
-- table already has — see 20260802000001_workout_sessions_and_messages.sql's
-- own doc comment.
--
-- No RLS change: workout_set_logs' existing client_own policy (for all,
-- client_id = private.client_id()) already covers inserting rows with this
-- new field.
alter table public.workout_set_logs
  add column substituted_exercise_id uuid references public.exercises (id);
