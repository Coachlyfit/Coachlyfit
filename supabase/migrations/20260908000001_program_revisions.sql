-- Audit + undo for structural edits to an ASSIGNED program (client_id not
-- null) -- a coach editing a client's live program has no record of what
-- it looked like before, and no way back if an edit turns out wrong.
-- Templates are excluded on purpose: they're edited freely before ever
-- being cloned onto a client, so snapshotting every template tweak would
-- be noise with no real undo value (cloneToClient already gives templates
-- their own instance-per-client history via source_template_id).
--
-- snapshot is the whole tree (program + days + items + sets) as one jsonb
-- blob, same shape ProgramsService.getTree already returns -- restoring
-- is "read this jsonb back and re-run the same day/item/set inserts
-- cloneToClient already knows how to do", not a new code path.
create table public.program_revisions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  snapshot jsonb not null,
  reason text,
  created_at timestamptz not null default now()
);

create index program_revisions_coach_id_idx on public.program_revisions (coach_id);
create index program_revisions_program_id_idx on public.program_revisions (program_id, created_at desc);

alter table public.program_revisions enable row level security;

-- Coach-only, same shape as every other coach-authored table -- no client
-- read policy at all, a client never sees "what this program used to look
-- like".
create policy coach_rw on public.program_revisions
  for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));

grant select, insert, update, delete on public.program_revisions to authenticated;
grant select, insert, update, delete on public.program_revisions to service_role;
