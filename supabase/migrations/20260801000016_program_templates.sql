-- Program templates: a coach builds a program once and clones it onto any
-- number of clients, instead of every program belonging to exactly one
-- client forever. `client_id is null` means template, mirroring the
-- library's `coach_id is null` = global convention (derive state from the
-- nullable FK rather than adding a redundant status column — see
-- library.service.ts's LibrarySource).
alter table public.programs alter column client_id drop not null;
alter table public.program_days alter column client_id drop not null;
alter table public.program_items alter column client_id drop not null;

-- No RLS policy changes needed. `client_read_own` on all three tables reads
-- `using (client_id = (select private.client_id()))` — a null client_id
-- never equals a client's id, so templates stay invisible to every client
-- automatically. `coach_rw` is keyed on coach_id only and is unaffected by
-- client_id being null.
