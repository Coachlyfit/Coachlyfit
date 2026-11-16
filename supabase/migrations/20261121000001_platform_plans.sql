-- Multi-week workout plans in the platform Template Library.
--
-- A plan is still a program: no new tables. A W-week plan is a cycle
-- (schedule_mode = 'cycle') of 7*W program_days; day_index d falls in week
-- ceil(d / 7), and a day with no items is a rest day (the existing convention,
-- see src/domain/programs/program-cycle.ts). So weeks need no schema change;
-- only the browsing metadata below is new.
--
-- Additive only: every existing row keeps kind = 'workout' and nulls elsewhere.
-- No RLS change: platform_read / platform_admin_rw (20261118000001) already
-- cover every platform program and every child day, including empty ones.

alter table public.programs
  add column kind text not null default 'workout' check (kind in ('workout', 'plan')),
  add column duration_weeks smallint check (duration_weeks between 1 and 52),
  add column gender_target text check (gender_target in ('female', 'male', 'all'));
