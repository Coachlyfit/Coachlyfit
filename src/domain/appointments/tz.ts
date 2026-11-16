import { TZDate } from "@date-fns/tz";
import { isValidTimeZone, localDateTime } from "@/domain/nutrition/reminders";

export { isValidTimeZone, localDateTime };

export const DEFAULT_TIME_ZONE = "Africa/Cairo";

/** The UTC instant of a wall-clock `date` (YYYY-MM-DD) + `time` (HH:MM[:SS])
 * in `tz`. Null when that wall-clock time does not exist (the hour skipped by
 * a spring-forward). An ambiguous time (the repeated hour of a fall-back)
 * resolves to its first occurrence. */
export function zonedToUtc(date: string, time: string, tz: string): Date | null {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const at = new TZDate(y, m - 1, d, hh, mm, 0, tz);
  const back = localDateTime(at, tz);
  if (back.date !== date || back.time !== time.slice(0, 5)) return null;
  return new Date(at.getTime());
}

/** The first instant of `date` in `tz`. Midnight can be skipped by a DST
 * change (Cairo springs forward at 00:00), so fall through to the first hour
 * that exists. */
export function startOfDay(date: string, tz: string): Date {
  for (const time of ["00:00", "01:00", "02:00"]) {
    const at = zonedToUtc(date, time, tz);
    if (at) return at;
  }
  return new Date(`${date}T00:00:00Z`);
}

/** 0 = Sunday .. 6 = Saturday, for a calendar date string. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Calendar-date arithmetic on YYYY-MM-DD strings (zone-free). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
