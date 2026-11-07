-- Section order within one program day. A "section" here is not its own
-- table: the builder derives them from program_items.block (workout =
-- warmup/main/cooldown, mobility_rehab = mobility/rehab) plus the day's
-- program_activities (activities). So the only state that needs persisting
-- is the order those derived sections render in.
--
-- Backfill: the DEFAULT applies to every existing program_days row when the
-- column is added, using exactly the order the builder rendered before this
-- migration (workout, then mobility & rehab, then cardio/recovery). Existing
-- programs therefore keep their current visual order on deploy.
--
-- RLS: unchanged. program_days' existing coach_rw policy (coach_id =
-- private.coach_id(), USING + WITH CHECK) is what scopes an update of this
-- column to the owning coach; client_read_own is SELECT-only, so a client can
-- never write a section order. No policy is loosened or added here.
alter table public.program_days
  add column section_order text[] not null
    default array['workout', 'mobility_rehab', 'activities']::text[];

-- Unknown keys would silently render nowhere; reject them at the DB boundary
-- so only the sections the app actually knows about can be stored. A future
-- section kind ships with its own migration that extends this list.
alter table public.program_days
  add constraint program_days_section_order_keys
    check (section_order <@ array['workout', 'mobility_rehab', 'activities']::text[]);
