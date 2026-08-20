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
