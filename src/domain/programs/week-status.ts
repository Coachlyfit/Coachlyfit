import { addDays } from "@/domain/nutrition/adherence";
import { dayIndexForDateWithMode, type ScheduleMode } from "./program-cycle";
import { primaryDays } from "./day-sessions";

export type CellStatus = "done" | "missed" | "upcoming" | "rest";
export type ProgramStatus = "ongoing" | "behind" | "notStarted";

/** The slice of ProgramsService.listOverview's row this module needs. */
export type OverviewProgram = {
  start_date: string;
  schedule_mode: string;
  program_days: {
    id: string;
    day_index: number;
    /** Set on an extra session of a day; those never sit on the calendar. */
    parent_day_id?: string | null;
    weekday: number | null;
    label_ar: string | null;
    label_en: string | null;
    program_items: { count: number }[];
    workout_sessions: { started_at: string; completed_at: string | null }[];
  }[];
};

export type WeekCell = {
  date: string;
  status: CellStatus;
  label_ar: string | null;
  label_en: string | null;
};

/** A day with zero program_items is a rest day — same idiom as day-plan.ts. */
export function isTrainingDay(day: OverviewProgram["program_days"][number]): boolean {
  return (day.program_items[0]?.count ?? 0) > 0;
}

/** The 7 calendar days starting at `weekStart` (a Saturday), each resolved to
 * done / missed / upcoming / rest. Nothing here is stored: the plan comes
 * from program-cycle.ts and completion from workout_sessions.
 *
 * A session counts for the slot of its own program_day on the date it was
 * started; a completed session left over after that (done a day late or
 * early) fills the earliest still-open slot of the same day in this week.
 * That is the week-scoped rule the client's Plan tab already uses
 * (WorkoutsService.getSessionForDay), so coach and client agree.
 *
 * Dates are UTC ISO strings throughout, same as program-cycle.ts. */
export function weekCells(program: OverviewProgram, weekStart: string, todayIso: string): WeekCell[] {
  const weekEnd = addDays(weekStart, 7);
  const weekdayToDayIndex = new Map<number, number>();
  const byIndex = new Map<number, OverviewProgram["program_days"][number]>();
  const completed = new Map<string, string[]>();
  const calendarDays = primaryDays(program.program_days);
  for (const day of calendarDays) {
    if (day.weekday != null) weekdayToDayIndex.set(day.weekday, day.day_index);
    byIndex.set(day.day_index, day);
    completed.set(
      day.id,
      day.workout_sessions
        .filter((s) => s.completed_at != null)
        .map((s) => s.started_at.slice(0, 10))
        .filter((date) => date >= weekStart && date < weekEnd)
        .sort()
    );
  }

  const slots = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dayIndex = dayIndexForDateWithMode(
      program.schedule_mode as ScheduleMode,
      program.start_date,
      calendarDays.length,
      date,
      weekdayToDayIndex
    );
    const day = dayIndex == null ? undefined : byIndex.get(dayIndex);
    return { date, day: day && isTrainingDay(day) ? day : null, done: false };
  });

  for (const slot of slots) {
    const dates = slot.day && completed.get(slot.day.id);
    const at = dates ? dates.indexOf(slot.date) : -1;
    if (at >= 0) {
      dates!.splice(at, 1);
      slot.done = true;
    }
  }
  for (const slot of slots) {
    if (slot.day && !slot.done && completed.get(slot.day.id)!.shift() != null) slot.done = true;
  }

  return slots.map(({ date, day, done }) => ({
    date,
    status: !day ? "rest" : done ? "done" : date < todayIso ? "missed" : "upcoming",
    label_ar: day?.label_ar ?? null,
    label_en: day?.label_en ?? null,
  }));
}

/** `cells` must be the current week's — "behind" means a missed workout this
 * week, not ever. */
export function programStatus(startDate: string, cells: { status: CellStatus }[], todayIso: string): ProgramStatus {
  if (startDate > todayIso) return "notStarted";
  return cells.some((c) => c.status === "missed") ? "behind" : "ongoing";
}

/** Whole-percent done / (done + missed). Upcoming workouts aren't due yet, so
 * they don't count against the client; null when nothing was due. */
export function adherence(cells: { status: CellStatus }[]): number | null {
  const done = cells.filter((c) => c.status === "done").length;
  const due = done + cells.filter((c) => c.status === "missed").length;
  return due === 0 ? null : Math.round((done / due) * 100);
}
