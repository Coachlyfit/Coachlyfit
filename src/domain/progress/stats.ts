import type { Database } from "@/lib/supabase/database.types";

type CheckinRow = Database["public"]["Tables"]["checkins"]["Row"];

export type ProgressRange = "7d" | "30d" | "90d" | "all";

const RANGE_DAYS: Record<Exclude<ProgressRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Parses a `?range=` query value, defaulting anything unrecognized to
 * "30d" — the coach's quick-scan default should be recent, not everything. */
export function parseRange(value: string | undefined): ProgressRange {
  if (value === "7d" || value === "30d" || value === "90d" || value === "all") return value;
  return "30d";
}

/** Inclusive ISO start date (YYYY-MM-DD) for a range, or undefined for
 * "all" history. `today` is injected rather than read from `new Date()`
 * here — one clock decision per request, and this stays testable. */
export function rangeStart(range: ProgressRange, today: Date): string | undefined {
  if (range === "all") return undefined;
  const days = RANGE_DAYS[range];
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start.toISOString().slice(0, 10);
}

// `checkin_date` is a Postgres `date` — a naive YYYY-MM-DD string with no
// timezone. Parsing it into a local Date and diffing is how off-by-one-day
// bugs happen across the MENA timezone spread, so every helper below steps
// UTC-normalized dates instead of using date-fns on a naive string.
function toUtcDate(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate_: string, delta: number): string {
  const date = new Date(toUtcDate(isoDate_));
  date.setUTCDate(date.getUTCDate() + delta);
  return isoDate(date);
}

/** Consecutive-day check-in streak, counted back from today. If today has
 * no check-in yet, counts back from yesterday instead — a client opening
 * the app before checking in should not see their streak read 0. A gap of
 * two or more days ends the streak. */
export function checkinStreak(checkins: CheckinRow[], today: Date): number {
  const dates = new Set(checkins.map((c) => c.checkin_date));
  const todayIso = isoDate(today);

  let cursor = dates.has(todayIso) ? todayIso : addDays(todayIso, -1);
  if (!dates.has(cursor)) return 0;

  let streak = 0;
  while (dates.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** The longest run of consecutive check-in days anywhere in the history,
 * not just the current one — "your best streak was 18 days" needs the
 * whole timeline, not a walk backward from today like checkinStreak. Sorts
 * once, then a single forward pass. */
export function longestStreak(checkins: CheckinRow[]): number {
  const dates = [...new Set(checkins.map((c) => c.checkin_date))].sort();
  if (dates.length === 0) return 0;

  let longest = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i++) {
    current = addDays(dates[i - 1], 1) === dates[i] ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

/** Mean adherence across the given rows, rounded to a whole percent. Rows
 * with a null adherence are excluded from both the numerator and the
 * denominator — a skipped field is unknown, not zero. Takes just the
 * `adherence` column (Pick, not the full row) so callers that only select
 * that column — e.g. the client roster's per-row average — don't have to
 * over-fetch the rest of `checkins` just to satisfy the parameter type. */
export function adherenceAverage(checkins: Pick<CheckinRow, "adherence">[]): number | null {
  const values = checkins.map((c) => c.adherence).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export type Trend = { latest: number; previous: number; delta: number; date: string };

/** Latest non-null weight vs. the reading before it. null if there isn't at
 * least one weight reading; delta is 0 when there's only one. The caller
 * decides whether the delta's sign is "good" — that's a product judgement,
 * not a domain fact. */
export function weightTrend(checkins: CheckinRow[]): Trend | null {
  const weighed = checkins
    .filter((c): c is CheckinRow & { weight: number } => c.weight != null)
    .sort((a, b) => (a.checkin_date < b.checkin_date ? -1 : a.checkin_date > b.checkin_date ? 1 : 0));
  if (weighed.length === 0) return null;

  const latest = weighed[weighed.length - 1];
  const previous = weighed.length > 1 ? weighed[weighed.length - 2] : latest;
  return {
    latest: latest.weight,
    previous: previous.weight,
    delta: latest.weight - previous.weight,
    date: latest.checkin_date,
  };
}

/** ISO date of the most recent check-in of any kind (for the coach KPI row).
 * Takes just `checkin_date`, same over-fetch reasoning as adherenceAverage. */
export function lastCheckinDate(checkins: Pick<CheckinRow, "checkin_date">[]): string | null {
  if (checkins.length === 0) return null;
  return checkins.reduce((latest, c) => (c.checkin_date > latest ? c.checkin_date : latest), checkins[0].checkin_date);
}

export const LATE_AFTER_DAYS = 7;

/** Whole days from a `date` column value to today, UTC-normalized like the
 * rest of this file. */
export function daysSince(isoDay: string, today: Date): number {
  return Math.round((toUtcDate(isoDate(today)) - toUtcDate(isoDay)) / (24 * 60 * 60 * 1000));
}

export type ClientCheckinStatus = "awaiting" | "late" | "active";

/** The roster's status, derived from the last check-in alone: none yet is
 * "awaiting", older than LATE_AFTER_DAYS is "late", anything else "active".
 * Deliberately not isClientLate: that one counts a never-checked-in active
 * client as late, which the dashboard and attention strip still want. */
export function clientCheckinStatus(lastCheckin: string | null, today: Date): ClientCheckinStatus {
  if (!lastCheckin) return "awaiting";
  return daysSince(lastCheckin, today) > LATE_AFTER_DAYS ? "late" : "active";
}

/** A client is "late" once they're active and have gone quiet — no
 * check-in ever, or none within LATE_AFTER_DAYS. Invited/archived clients
 * are never late; there's nothing to be late on. Pulled out of the client
 * roster page so the profile's attention strip can flag the same thing. */
export function isClientLate(
  status: "invited" | "active" | "archived",
  lastActive: string | null,
  today: Date
): boolean {
  if (status !== "active") return false;
  const cutoff = new Date(today.getTime() - LATE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return !lastActive || lastActive < cutoff;
}
