// program_days.day_index has no calendar meaning of its own — it's a
// coach-assigned display order ("Day 1", "Day 2"...), contiguous from 1,
// with no gap reserved for rest (see programs.service.ts's addDay/
// nextDayIndex). The client app needs real dates, so this cycles the
// program's day count repeatedly from programs.start_date: day 1 of the
// cycle lands on start_date, and the cycle repeats every `cycleLength`
// calendar days indefinitely. A day with zero program_items is what
// renders as a rest day — there's no separate "is rest" flag.
//
// Same UTC-normalized-date approach as progress/stats.ts, for the same
// reason: checkin_date-style naive date strings must not be diffed via
// locale-sensitive Date parsing.
function toUtcDate(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 1-based day_index a program is on for a given calendar date, cycling
 * every `cycleLength` days from `startDate`. Returns null for a program
 * with no days (cycleLength 0) or a date before the program started. */
export function dayIndexForDate(startDate: string, cycleLength: number, targetDate: string): number | null {
  if (cycleLength <= 0) return null;
  const daysSinceStart = Math.floor((toUtcDate(targetDate) - toUtcDate(startDate)) / 86_400_000);
  if (daysSinceStart < 0) return null;
  return (daysSinceStart % cycleLength) + 1;
}

/** The day_index for each of the 7 calendar dates starting at `weekStart`
 * (inclusive), in order — for a 7-day week view. */
export function dayIndicesForWeek(startDate: string, cycleLength: number, weekStartDate: string): (number | null)[] {
  const start = toUtcDate(weekStartDate);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    return dayIndexForDate(startDate, cycleLength, date);
  });
}

/** 1-based training week for a calendar date, used by the client workout
 * runner to pick which week's progression projection to show. Distinct from
 * `dayIndexForDate`: that maps date -> which day of the split repeats; this
 * maps date -> which week of progression applies. Clamps at `maxWeeks` (the
 * design caps the selector at 12) rather than progressing forever, and
 * returns 1 for a date before the program started (same "show week 1" floor
 * `dayIndexForDate` would need if it didn't return null). */
export function weekIndexForDate(startDate: string, targetDate: string, maxWeeks = 12): number {
  const daysSinceStart = Math.floor((toUtcDate(targetDate) - toUtcDate(startDate)) / 86_400_000);
  if (daysSinceStart < 0) return 1;
  const week = Math.floor(daysSinceStart / 7) + 1;
  return Math.min(week, maxWeeks);
}

export type ProgramWeekProgress = {
  /** 1-based, uncapped by the 12-week progression ceiling; clamped to totalWeeks when known. */
  week: number;
  /** null when the program has no end_date — its length is unknown, never guessed. */
  totalWeeks: number | null;
  /** 0-100 share of the program's calendar span elapsed; null when totalWeeks is. */
  pct: number | null;
};

/** "Week N of M" for display. Distinct from weekIndexForDate (progression's
 * 12-capped index) and from cycle length (days in the split): the home screen
 * once divided one by the other and showed "week 7 of 5". */
export function programWeekProgress(startDate: string, endDate: string | null, targetDate: string): ProgramWeekProgress {
  const daysSinceStart = Math.max(0, Math.floor((toUtcDate(targetDate) - toUtcDate(startDate)) / 86_400_000));
  const rawWeek = Math.floor(daysSinceStart / 7) + 1;
  if (!endDate) return { week: rawWeek, totalWeeks: null, pct: null };

  const spanDays = Math.max(1, Math.floor((toUtcDate(endDate) - toUtcDate(startDate)) / 86_400_000) + 1);
  const totalWeeks = Math.ceil(spanDays / 7);
  return {
    week: Math.min(rawWeek, totalWeeks),
    totalWeeks,
    pct: Math.min(100, Math.round((daysSinceStart / spanDays) * 100)),
  };
}

export type ScheduleMode = "cycle" | "weekly";

/** Resolves which program_day (by its day_index, matching dayIndexForDate's
 * return shape) is scheduled for a calendar date, honoring schedule_mode.
 * Weekly mode: JS's getUTCDay() (0=Sun..6=Sat) against each day's weekday
 * column, resolved via a caller-supplied lookup rather than a query here —
 * this module stays pure/DB-free. A weekday with no matching program_day
 * (or cycle mode with cycleLength 0) is a rest day: returns null. */
export function dayIndexForDateWithMode(
  mode: ScheduleMode,
  startDate: string,
  cycleLength: number,
  targetDate: string,
  weekdayToDayIndex: Map<number, number>
): number | null {
  if (mode === "cycle") return dayIndexForDate(startDate, cycleLength, targetDate);
  const start = toUtcDate(startDate);
  const target = toUtcDate(targetDate);
  if (target < start) return null;
  const weekday = new Date(target).getUTCDay();
  return weekdayToDayIndex.get(weekday) ?? null;
}

/** Weekly-mode counterpart to dayIndicesForWeek — the day_index (or null
 * for a rest day) scheduled for each of the 7 calendar dates starting at
 * `weekStart`. */
export function dayIndicesForWeekWithMode(
  mode: ScheduleMode,
  startDate: string,
  cycleLength: number,
  weekStartDate: string,
  weekdayToDayIndex: Map<number, number>
): (number | null)[] {
  const start = toUtcDate(weekStartDate);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    return dayIndexForDateWithMode(mode, startDate, cycleLength, date, weekdayToDayIndex);
  });
}

/** ISO date (YYYY-MM-DD) of the Saturday on/before `isoDate` — this region's
 * week start (matches the design's week ordering: Sat...Fri). JS
 * `getUTCDay()` is 0=Sunday, so Saturday is 6; the `+1) % 7` rotates the
 * origin so Saturday itself maps to a 0-day offset. */
export function startOfWeekSaturday(isoDate_: string): string {
  const date = toUtcDate(isoDate_);
  const dow = new Date(date).getUTCDay();
  const offsetFromSaturday = (dow + 1) % 7;
  return new Date(date - offsetFromSaturday * 86_400_000).toISOString().slice(0, 10);
}
