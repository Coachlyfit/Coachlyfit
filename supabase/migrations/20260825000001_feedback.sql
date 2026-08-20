-- Coach feedback: a lightweight, write-only-for-coaches suggestion box. A
-- coach can insert (coach_insert) but there's no select-own policy, so once
-- submitted they can't read it back — the same UX as dropping a note in a
-- box, not a two-way thread like messages. Only an admin can read
-- submissions back, via admin_read, which mirrors payments/subscriptions'
-- admin_read policy in 20260731000010_billing.sql exactly.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index feedback_coach_id_idx on public.feedback (coach_id, created_at desc);

alter table public.feedback enable row level security;

create policy coach_insert on public.feedback
  for insert to authenticated
  with check (coach_id = (select private.coach_id()));

create policy admin_read on public.feedback
  for select to authenticated
  using ((select private.is_admin()));

grant insert on public.feedback to authenticated;
grant select, insert, update, delete on public.feedback to service_role;
