-- Diet plan templates, same convention as 20260809000001_program_progression.sql
-- gave programs: `client_id is null` means template, cloned onto any number
-- of clients via DietPlansService.cloneToClient. No RLS policy changes
-- needed — client_read_own's `client_id = private.client_id()` already never
-- matches a null client_id, so templates stay invisible to every client.
alter table public.diet_plans alter column client_id drop not null;
alter table public.meals alter column client_id drop not null;
alter table public.meal_items alter column client_id drop not null;

alter table public.diet_plans
  add column source_template_id uuid references public.diet_plans (id) on delete set null;
create index diet_plans_source_template_id_idx on public.diet_plans (source_template_id);
