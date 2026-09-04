-- Exercise-level outcome for a session: done or skipped, plus optional
-- post-exercise feedback. The old flow only tracked completion implicitly
-- through set logs -- there was no way to record "this exercise was
-- skipped" (vs. simply never gotten to) or how it felt. One row per
-- (session, program_item) -- same denormalized coach_id/client_id shape as
-- workout_set_logs, so RLS stays a flat comparison.
create table public.workout_exercise_results (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  program_item_id uuid not null references public.program_items (id) on delete cascade,
  status text not null check (status in ('done', 'skipped')),
  difficulty smallint check (difficulty between 1 and 5),
  pain smallint check (pain between 0 and 5),
  energy smallint check (energy between 1 and 5),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  unique (session_id, program_item_id)
);

create index workout_exercise_results_coach_id_idx on public.workout_exercise_results (coach_id);
create index workout_exercise_results_session_id_idx on public.workout_exercise_results (session_id);

alter table public.workout_exercise_results enable row level security;

-- Same split as workout_sessions/workout_set_logs: the client owns their
-- own execution record, the coach reads it to review compliance and spot
-- pain reports.
create policy coach_read on public.workout_exercise_results for select to authenticated
  using (coach_id = (select private.coach_id()));
create policy client_own on public.workout_exercise_results for all to authenticated
  using (client_id = (select private.client_id()))
  with check (client_id = (select private.client_id()));

grant select, insert, update, delete on public.workout_exercise_results to authenticated;
grant select, insert, update, delete on public.workout_exercise_results to service_role;
