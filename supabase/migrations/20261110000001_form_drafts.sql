-- Client-side draft answers for a pending form assignment, so a client can
-- leave mid-form and resume at the same question. One row per assignment,
-- private to the client (coaches never read drafts).
create table public.form_drafts (
  assignment_id uuid primary key references public.form_assignments (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  current_field_id text,
  updated_at timestamptz not null default now()
);

create index form_drafts_client_id_idx on public.form_drafts (client_id);

alter table public.form_drafts enable row level security;

-- Select/delete on own rows; insert/update only while the assignment is
-- still pending and really belongs to this client, so a draft can't be
-- planted on someone else's (or an already-submitted) assignment.
create policy client_own_read on public.form_drafts
  for select to authenticated
  using (client_id = (select private.client_id()));

create policy client_own_write on public.form_drafts
  for insert to authenticated
  with check (
    client_id = (select private.client_id())
    and exists (
      select 1 from public.form_assignments fa
      where fa.id = assignment_id
        and fa.client_id = (select private.client_id())
        and fa.status = 'pending'
    )
  );

create policy client_own_update on public.form_drafts
  for update to authenticated
  using (client_id = (select private.client_id()))
  with check (
    client_id = (select private.client_id())
    and exists (
      select 1 from public.form_assignments fa
      where fa.id = assignment_id
        and fa.client_id = (select private.client_id())
        and fa.status = 'pending'
    )
  );

create policy client_own_delete on public.form_drafts
  for delete to authenticated
  using (client_id = (select private.client_id()));

grant select, insert, update, delete on public.form_drafts to authenticated;
grant select, insert, update, delete on public.form_drafts to service_role;

-- A submission completes its assignment (see 20260731000007_forms.sql) and
-- now also discards the draft. Same security definer scope as before.
create or replace function private.complete_assignment_on_submit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.form_assignments
  set status = 'completed'
  where id = new.assignment_id;

  delete from public.form_drafts where assignment_id = new.assignment_id;
  return new;
end;
$$;

-- Idempotent submit: one submission per assignment. Refuse to build the index
-- over existing duplicates rather than silently picking a survivor.
do $$
begin
  if exists (
    select 1 from public.form_submissions
    group by assignment_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate form_submissions per assignment_id exist; resolve them before applying this migration.';
  end if;
end $$;

create unique index form_submissions_assignment_id_key
  on public.form_submissions (assignment_id);
