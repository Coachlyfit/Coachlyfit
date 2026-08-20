create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  checkin_date date not null default current_date,
  weight numeric,
  mood int check (mood between 1 and 5),
  energy int check (energy between 1 and 5),
  adherence int check (adherence between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  unique (client_id, checkin_date)
);

-- Long format (one row per tracked measure) so any body metric — waist,
-- body fat %, arm circumference, a coach-invented one — charts without a
-- schema change.
create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  taken_on date not null default current_date,
  metric text not null,
  value numeric not null,
  unit text not null,
  created_at timestamptz not null default now()
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  checkin_id uuid references public.checkins (id) on delete set null,
  storage_path text not null,
  kind text not null check (kind in ('photo', 'video', 'file')),
  created_at timestamptz not null default now()
);

create index checkins_coach_id_idx on public.checkins (coach_id);
create index checkins_client_id_idx on public.checkins (client_id, checkin_date);
create index body_metrics_coach_id_idx on public.body_metrics (coach_id);
create index body_metrics_client_id_idx on public.body_metrics (client_id, metric, taken_on);
create index media_coach_id_idx on public.media (coach_id);
create index media_client_id_idx on public.media (client_id);

alter table public.checkins enable row level security;
alter table public.body_metrics enable row level security;
alter table public.media enable row level security;

-- Client-authored progress data: the client owns it (insert/select/update),
-- the coach reviews it (select only — a coach editing a client's
-- self-reported check-in would be misleading data).
create policy coach_read on public.checkins for select to authenticated
  using (coach_id = (select private.coach_id()));
create policy client_own on public.checkins for all to authenticated
  using (client_id = (select private.client_id()))
  with check (client_id = (select private.client_id()));

create policy coach_read on public.body_metrics for select to authenticated
  using (coach_id = (select private.coach_id()));
create policy client_own on public.body_metrics for all to authenticated
  using (client_id = (select private.client_id()))
  with check (client_id = (select private.client_id()));

create policy coach_read on public.media for select to authenticated
  using (coach_id = (select private.coach_id()));
create policy client_own on public.media for all to authenticated
  using (client_id = (select private.client_id()))
  with check (client_id = (select private.client_id()));

grant select, insert, update, delete on public.checkins to authenticated;
grant select, insert, update, delete on public.body_metrics to authenticated;
grant select, insert, update, delete on public.media to authenticated;
grant select, insert, update, delete on public.checkins to service_role;
grant select, insert, update, delete on public.body_metrics to service_role;
grant select, insert, update, delete on public.media to service_role;

-- Progress photos: private bucket, path convention `coach_id/client_id/file`.
insert into storage.buckets (id, name, public)
values ('progress-media', 'progress-media', false);

create policy progress_media_coach_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-media'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

create policy progress_media_client_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-media'
    and (storage.foldername(name))[1] = (select private.tenant_id())::text
    and (storage.foldername(name))[2] = (select private.client_id())::text
  );

create policy progress_media_coach_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'progress-media'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

create policy progress_media_client_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'progress-media'
    and (storage.foldername(name))[1] = (select private.tenant_id())::text
    and (storage.foldername(name))[2] = (select private.client_id())::text
  );

create policy progress_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'progress-media'
    and (
      (storage.foldername(name))[1] = (select private.coach_id())::text
      or (
        (storage.foldername(name))[1] = (select private.tenant_id())::text
        and (storage.foldername(name))[2] = (select private.client_id())::text
      )
    )
  );
