import { dayIndicesForWeekWithMode, type ScheduleMode } from "./program-cycle";
import { addDays } from "@/domain/nutrition/adherence";
import { primaryDays } from "./day-sessions";

type TrainingDay = {
  id: string;
  day_index: number;
  parent_day_id?: string | null;
  weekday: number | null;
  program_items: { block: string }[];
};

type WeekProgram = {
  start_date: string;
  schedule_mode: string;
  program_days: TrainingDay[];
};

/** Ordinary session work: warm-up, main, accessory, finisher, cool-down —
 * everything except mobility/rehab blocks (same rule as day-plan.ts). */
const isWorkoutBlock = (block: string) => block !== "mobility" && block !== "rehab";

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
  const calendarDays = primaryDays(program.program_days);
  const weekdayToDayIndex = new Map<number, number>();
  for (const d of calendarDays) {
    if (d.weekday != null) weekdayToDayIndex.set(d.weekday, d.day_index);
  }
  const indices = dayIndicesForWeekWithMode(
    program.schedule_mode as ScheduleMode,
    program.start_date,
    calendarDays.length,
    weekStart,
    weekdayToDayIndex
  );
  // Workouts a calendar day carries: itself, plus each extra session that has
  // strength work (an AM/PM split is two planned workouts that day).
  const workoutsOnIndex = new Map<number, number>();
  for (const d of program.program_days) {
    if (!d.program_items.some((i) => isWorkoutBlock(i.block))) continue;
    workoutsOnIndex.set(d.day_index, (workoutsOnIndex.get(d.day_index) ?? 0) + 1);
  }
  const planned = indices.reduce<number>((sum, i) => sum + (i != null ? (workoutsOnIndex.get(i) ?? 0) : 0), 0);

  const weekEnd = addDays(weekStart, 7);
  const inWeek = completedStartedAt.filter((s) => s.slice(0, 10) >= weekStart && s.slice(0, 10) < weekEnd).length;
  return { planned, done: Math.min(inWeek, planned) };
}
