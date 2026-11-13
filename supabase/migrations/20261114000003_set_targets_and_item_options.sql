-- P1 of the training-plan-type audit: richer per-set prescriptions and a few
-- per-exercise options. Columns on existing tables only, so the existing RLS
-- policies (coach_rw / client_read_own) already cover them.

-- 1. Per-set targets ---------------------------------------------------------
alter table public.program_item_sets
  -- What kind of set this is. Working is the default; warmup / backoff / drop /
  -- failure / amrap are shown to the client as a tag and carried onto the
  -- logged set (workout_set_logs.extra.set_type).
  add column set_type text not null default 'working'
    check (set_type in ('warmup', 'working', 'backoff', 'drop', 'failure', 'amrap')),
  -- Upper end of a rep range ("8-12": reps = 8, reps_max = 12).
  add column reps_max int check (reps_max between 1 and 500),
  -- Load as a percentage of the athlete's one-rep max. The runner turns it
  -- into kilograms from their logged history; weight stays the explicit
  -- override when a coach prescribes kilograms.
  add column pct_1rm numeric(5, 2) check (pct_1rm > 0 and pct_1rm <= 200),
  add column rpe_target numeric(3, 1) check (rpe_target between 1 and 10),
  add column rir_target smallint check (rir_target between 0 and 10),
  add constraint program_item_sets_reps_range check (reps_max is null or reps is null or reps_max >= reps);

-- 2. Per-exercise options ----------------------------------------------------
alter table public.program_items
  -- Lifting tempo as the coach writes it, e.g. "3-1-1-0" (eccentric, pause,
  -- concentric, top). Free text, short. Overrides the library's exercise tempo.
  add column tempo text check (char_length(tempo) <= 12),
  -- Unilateral work: the prescription is per side.
  add column per_side boolean not null default false,
  -- The Scaled option shown next to the Rx prescription (what to swap or
  -- reduce). Text rather than an exercise reference: it can scale load, reps
  -- or movement, and a reference would need its own client read policy.
  add column scaled_notes_ar text check (char_length(scaled_notes_ar) <= 300),
  add column scaled_notes_en text check (char_length(scaled_notes_en) <= 300);
