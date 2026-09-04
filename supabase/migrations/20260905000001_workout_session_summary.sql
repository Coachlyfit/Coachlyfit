-- Session summary columns, computed once at completeSession() rather than
-- re-aggregated from workout_set_logs on every history-list read. Nullable:
-- a session started before this migration (or one abandoned mid-way,
-- completed_at still null) has no summary yet.
alter table public.workout_sessions
  add column total_volume numeric,
  add column sets_completed int,
  add column sets_prescribed int;
