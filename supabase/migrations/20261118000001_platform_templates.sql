-- Platform training templates ("Template Library").
--
-- A platform template is a program with coach_id IS NULL AND client_id IS NULL,
-- mirroring the exercise library's `coach_id is null` = platform-owned
-- convention (no status column). Coaches may READ published ones; only admins
-- write them. A coach "customizes" a template by cloning it into their own
-- template (coach_id = coach, source_template_id = original), so one coach's
-- edit never changes what other coaches see.
--
-- No existing policy needs to change:
--   * coach_rw / coach_read_own compare coach_id = private.coach_id(), which is
--     never true for NULL -> coaches can neither see unpublished platform rows
--     nor update/delete any of them.
--   * client_read_own compares client_id, which is NULL on templates -> clients
--     never see them.

-- 1. Ownership becomes nullable on the program tree ----------------------------
alter table public.programs            alter column coach_id drop not null;
alter table public.program_days        alter column coach_id drop not null;
alter table public.program_items       alter column coach_id drop not null;
alter table public.program_item_sets   alter column coach_id drop not null;
alter table public.program_activities  alter column coach_id drop not null;

-- A platform row can never be attached to a client.
alter table public.programs
  add constraint programs_platform_no_client check (coach_id is not null or client_id is null);
alter table public.program_days
  add constraint program_days_platform_no_client check (coach_id is not null or client_id is null);
alter table public.program_items
  add constraint program_items_platform_no_client check (coach_id is not null or client_id is null);
alter table public.program_item_sets
  add constraint program_item_sets_platform_no_client check (coach_id is not null or client_id is null);
alter table public.program_activities
  add constraint program_activities_platform_no_client check (coach_id is not null or client_id is null);

-- 2. Browsing metadata ---------------------------------------------------------
-- goal / level / equipment / description_* / plan_type already exist (20261114000001).
alter table public.programs
  add column slug text,
  add column published boolean not null default false,
  add column source_url text,
  add column days_per_week smallint check (days_per_week between 1 and 7),
  add column categories text[] not null default '{}'
    check (categories <@ array[
      'strength', 'fat_burning', 'full_body', 'at_home', 'body_weight', 'core',
      'legs', 'chest', 'back', 'shoulders', 'arms', 'glutes'
    ]::text[]);

-- Stable upsert key for the seed; only platform rows carry a slug.
create unique index programs_platform_slug_uniq on public.programs (slug) where coach_id is null;
alter table public.programs
  add constraint programs_platform_has_slug check (coach_id is not null or slug is not null);

-- Platform templates may only reference global exercises, so every coach can open them.
create or replace function private.platform_item_global_exercise()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.coach_id is null and not exists (
    select 1 from public.exercises e where e.id = new.exercise_id and e.coach_id is null
  ) then
    raise exception 'platform template items must reference global exercises'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger program_items_platform_global_exercise
  before insert or update of exercise_id, coach_id on public.program_items
  for each row execute function private.platform_item_global_exercise();

-- 3. RLS ----------------------------------------------------------------------
-- Read: any coach (or team member) sees published platform templates. Children
-- are gated through their parent's RLS, so `published` cascades down.
create policy platform_read on public.programs
  for select to authenticated
  using (
    coach_id is null and client_id is null and published
    and (select private.coach_id()) is not null
  );

create policy platform_read on public.program_days
  for select to authenticated
  using (
    coach_id is null and client_id is null
    and (select private.coach_id()) is not null
    and program_id in (select id from public.programs)
  );

create policy platform_read on public.program_items
  for select to authenticated
  using (
    coach_id is null and client_id is null
    and (select private.coach_id()) is not null
    and program_day_id in (select id from public.program_days)
  );

create policy platform_read on public.program_item_sets
  for select to authenticated
  using (
    coach_id is null and client_id is null
    and (select private.coach_id()) is not null
    and program_item_id in (select id from public.program_items)
  );

create policy platform_read on public.program_activities
  for select to authenticated
  using (
    coach_id is null and client_id is null
    and (select private.coach_id()) is not null
    and program_day_id in (select id from public.program_days)
  );

-- Write: admins only, platform rows only (published or not).
do $$
declare
  t text;
begin
  foreach t in array array[
    'programs', 'program_days', 'program_items', 'program_item_sets', 'program_activities'
  ] loop
    execute format($p$
      create policy platform_admin_rw on public.%I
        for all to authenticated
        using (coach_id is null and client_id is null and (select private.is_admin()))
        with check (coach_id is null and client_id is null and (select private.is_admin()))
    $p$, t);
  end loop;
end;
$$;
