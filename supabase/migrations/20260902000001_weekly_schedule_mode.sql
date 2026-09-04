-- Weekly scheduling: a program can pin its days to specific weekdays
-- ("leg day is every Tuesday") instead of the existing cycle mode ("day 1
-- repeats every N days from start_date, regardless of what weekday it
-- lands on"). schedule_mode picks which of dayIndexForDate (cycle) or
-- dayForWeekday (weekly, program-cycle.ts) the client app and builder use
-- to resolve "today" -- both modes coexist in the schema and the domain
-- layer, existing cycle-mode programs are entirely unaffected.
--
-- weekday follows JS's Date.getUTCDay() convention (0 = Sunday .. 6 =
-- Saturday) for direct compatibility with program-cycle.ts's existing
-- UTC-date handling. Nullable: only meaningful in weekly mode, and even
-- there a day with weekday null has no calendar slot (effectively
-- unscheduled) rather than being forced onto some default day.
alter table public.program_days
  add column weekday smallint check (weekday between 0 and 6);

alter table public.programs
  add column schedule_mode text not null default 'cycle' check (schedule_mode in ('cycle', 'weekly'));
