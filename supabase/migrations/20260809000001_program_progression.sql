-- Per-set prescribed reps/weight/rest, plus a week-progression rule per
-- item. Brings the prescription side to parity with workout_set_logs
-- (20260802000001_workout_sessions_and_messages.sql), which has always
-- logged performance per set_index — only the prescription side (sets int +
-- reps text range) was flat. Weeks 2-12 are never stored: they're a pure
-- projection of week 1's base sets computed by progression.ts, so there's
-- no week/cycle column here at all.
create table public.program_item_sets (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade, -- nullable: template rows, mirrors program_items
  program_item_id uuid not null references public.program_items (id) on delete cascade,
  set_index int not null,
  reps int not null default 10,
  weight numeric,
  rest_seconds int,
  unique (program_item_id, set_index)
);

create index program_item_sets_coach_id_idx on public.program_item_sets (coach_id);
create index program_item_sets_program_item_id_idx on public.program_item_sets (program_item_id);

alter table public.program_item_sets enable row level security;

-- Same coach_rw + client_read_own split as program_items itself
-- (20260731000008_plans.sql) — coach_id/client_id are denormalized onto this
-- table too so the policy stays a flat column check, not a join up through
-- program_items -> program_days -> programs.
create policy coach_rw on public.program_item_sets for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));
create policy client_read_own on public.program_item_sets for select to authenticated
  using (client_id = (select private.client_id()));

grant select, insert, update, delete on public.program_item_sets to authenticated;
grant select, insert, update, delete on public.program_item_sets to service_role;

-- Backfill: one program_item_sets row per existing item's `sets` count, so
-- no in-flight program loses its prescription the moment the app cuts over
-- to reading program_item_sets instead of sets/reps. reps parsed from the
-- free-text range's low end — the exact parse the client workout runner
-- already does at read time (workout-session-client.tsx:82) — falling back
-- to 10 if the text doesn't parse (matches program_items.reps' own default).
insert into public.program_item_sets (coach_id, client_id, program_item_id, set_index, reps, weight, rest_seconds)
select
  pi.coach_id,
  pi.client_id,
  pi.id,
  gs.set_index,
  coalesce(nullif(regexp_replace(split_part(replace(pi.reps, '–', '-'), '-', 1), '[^0-9]', '', 'g'), '')::int, 10),
  null,
  pi.rest_seconds
from public.program_items pi
cross join lateral generate_series(1, greatest(pi.sets, 1)) as gs(set_index);

-- Week-progression rule per item. Read-only projection (progression.ts)
-- computes weeks 2-12 from week 1's program_item_sets using this rule; every
-- 4th week (4, 8, 12) is always the unmodified base regardless of rule.
alter table public.program_items
  add column progression_rule text not null default 'none'
    check (progression_rule in ('none', 'plus_2_5kg_week', 'plus_5kg_week', 'plus_1_rep_week'));

-- Template lineage: which template a client's program was cloned from, so
-- Program Builder can list "assigned to N clients" on a template and jump
-- into each instance. Set once by cloneToClient, never by direct edit.
alter table public.programs
  add column source_template_id uuid references public.programs (id) on delete set null;
create index programs_source_template_id_idx on public.programs (source_template_id);
