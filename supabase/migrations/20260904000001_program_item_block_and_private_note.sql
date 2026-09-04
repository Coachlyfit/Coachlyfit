-- Block kind (warmup/main/cooldown) groups a day's items into training
-- phases -- distinct from group_key/group_kind (superset/circuit), which
-- groups items for round-robin execution within whatever block they're in.
-- default 'main' so every existing item is unaffected.
--
-- coach_note_private is a coach-only annotation on a prescription (e.g.
-- "watch her lower back on this one") that must never reach the client --
-- unlike notes_ar/notes_en, which the client already sees on the workout
-- screen. Enforced by omission: every client-facing select (getActiveTreeForClient,
-- the workout session page's query) simply never lists this column, the same
-- way section_exercises.coach_note_private worked on the reference platform
-- this idea came from. RLS can't enforce column-level secrecy on its own
-- (client_read_own is a row policy), so the query shape IS the boundary here.
alter table public.program_items
  add column block text not null default 'main' check (block in ('warmup', 'main', 'cooldown')),
  add column coach_note_private text check (char_length(coach_note_private) <= 1000);
