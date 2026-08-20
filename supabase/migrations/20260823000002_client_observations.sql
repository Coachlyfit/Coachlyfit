-- Client observations: private coach notes about a client -- technique,
-- adherence patterns, motivation -- shown as a dated list on the client
-- detail page. Coach-only in both directions (no client_read_own): these
-- are the coach's own working notes, not something meant for the client to
-- see, unlike checkins/body_metrics which the client authors themselves.
create table public.client_observations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index client_observations_client_id_idx on public.client_observations (client_id, created_at desc);

alter table public.client_observations enable row level security;

create policy coach_rw on public.client_observations
  for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));

grant select, insert, update, delete on public.client_observations to authenticated;
grant select, insert, update, delete on public.client_observations to service_role;
