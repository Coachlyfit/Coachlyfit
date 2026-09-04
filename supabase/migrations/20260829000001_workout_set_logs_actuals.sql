-- Closes the platform audit's #1 finding: the client training session
-- logs a set at its prescribed values with a one-tap toggle and never
-- records what was actually lifted. weight/reps exist on this table
-- already but the client never sends them — this migration adds the
-- columns needed to make that real: a snapshot of what was prescribed
-- (so editing the prescription later never rewrites history), an optional
-- RPE, and a free-text note per set.
alter table public.workout_set_logs
  add column prescribed_reps int,
  add column prescribed_weight numeric,
  add column rpe numeric check (rpe between 1 and 10),
  add column notes text check (char_length(notes) <= 500);

-- Backfill from program_item_sets — best-effort: a log's program_item_id
-- may have multiple sets, matched here by set_index which is how the
-- client already keys sets in memory.
update public.workout_set_logs wsl
set
  prescribed_reps = pis.reps,
  prescribed_weight = pis.weight
from public.program_item_sets pis
where pis.program_item_id = wsl.program_item_id
  and pis.set_index = wsl.set_index
  and wsl.prescribed_reps is null;

-- One log per (session, item, set) — without this, a double-submit (a
-- retry after a flaky connection, or a resumed session on a second
-- device) silently duplicates a set. The client session flow moves from
-- insert-only to upsert-on-conflict against this key.
alter table public.workout_set_logs
  add constraint workout_set_logs_session_item_set_key unique (session_id, program_item_id, set_index);
