-- Persists in-progress session state so a refresh, tab close, or app
-- backgrounding doesn't lose elapsed time or scroll position — the client
-- picks up exactly where they left off instead of a resumed session
-- silently resetting elapsedS to 0.
alter table public.workout_sessions
  add column elapsed_seconds int not null default 0,
  add column current_item_id uuid references public.program_items (id) on delete set null;
