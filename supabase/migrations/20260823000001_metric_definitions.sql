-- Custom metric registry: promotes METRIC_PRESETS (progress/metric-presets.ts,
-- 5 hardcoded measurements) from "the only options" to "the built-in
-- floor" -- a coach can now define their own (e.g. "neck circumference")
-- that show up as real picker options, bilingual label and all, instead of
-- a client having to invent a free-text metric key. body_metrics.metric is
-- untouched (still free text) and the progress chart already renders any
-- key present there generically (see (client)/c/progress/page.tsx's
-- `metricPresetI18nKey(metric) ?? metric.replace(/_/g, " ")` fallback) --
-- this table only adds a proper named source for the picker to offer.
create table public.client_metric_definitions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  key text not null,
  label_ar text not null,
  label_en text not null,
  unit text not null,
  created_at timestamptz not null default now(),
  unique (coach_id, key)
);

create index client_metric_definitions_coach_id_idx on public.client_metric_definitions (coach_id);

alter table public.client_metric_definitions enable row level security;

create policy coach_write on public.client_metric_definitions
  for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));

-- A client logging their own metrics needs to see their coach's custom
-- registry, not just create/edit it -- same "client reads the coach's
-- library" reasoning as exercises_visible/foods_visible.
create policy tenant_read on public.client_metric_definitions
  for select to authenticated
  using (coach_id = (select private.tenant_id()));

grant select, insert, update, delete on public.client_metric_definitions to authenticated;
grant select, insert, update, delete on public.client_metric_definitions to service_role;
