import { dayIndicesForWeekWithMode, type ScheduleMode } from "./program-cycle";
import { addDays } from "@/domain/nutrition/adherence";

type TrainingDay = {
  id: string;
  day_index: number;
  weekday: number | null;
  program_items: { block: string }[];
};

type WeekProgram = {
  start_date: string;
  schedule_mode: string;
  program_days: TrainingDay[];
};

const WORKOUT_BLOCKS = ["warmup", "main", "cooldown"];

/** Workouts planned vs. done in the 7-day (Saturday-start) week at weekStart.
 * Planned = scheduled days that carry strength work (same "workout" blocks as
 * day-plan.ts; a rest/cardio/rehab-only day doesn't count). Done = completed
 * sessions started inside the week. Each is capped to `planned` so a bonus
 * session can't read "6/5". Dates are UTC ISO strings, like program-cycle.ts. */
export function weekWorkoutCounts(
  program: WeekProgram,
  weekStart: string,
  completedStartedAt: string[]
): { planned: number; done: number } {
  const weekdayToDayIndex = new Map<number, number>();
  for (const d of program.program_days) {
    if (d.weekday != null) weekdayToDayIndex.set(d.weekday, d.day_index);
  }
  const indices = dayIndicesForWeekWithMode(
    program.schedule_mode as ScheduleMode,
    program.start_date,
    program.program_days.length,
    weekStart,
    weekdayToDayIndex
  );
  const trainingIndices = new Set(
    program.program_days.filter((d) => d.program_items.some((i) => WORKOUT_BLOCKS.includes(i.block))).map((d) => d.day_index)
  );
  const planned = indices.filter((i) => i != null && trainingIndices.has(i)).length;

  const weekEnd = addDays(weekStart, 7);
  const inWeek = completedStartedAt.filter((s) => s.slice(0, 10) >= weekStart && s.slice(0, 10) < weekEnd).length;
  return { planned, done: Math.min(inWeek, planned) };
}
