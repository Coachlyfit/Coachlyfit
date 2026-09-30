export type NutritionLogDay = { log_date: string; kcal: number | null; off_plan: boolean };

export type DayStatus = "logged" | "off_plan" | "missed" | "future";

export type NutritionAdherence = {
  loggedDays: number;
  totalDays: number;
  offPlanDays: number;
  /** Whole percent of loggedDays / totalDays, null when the range is empty. */
  rate: number | null;
  currentStreak: number;
  longestStreak: number;
};

// log_date is a Postgres `date` (naive YYYY-MM-DD) — stepped as UTC dates,
// same reasoning as progress/stats.ts.
function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso: string, delta: number): string {
  const date = new Date(toUtc(iso));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** A day counts as logged when it has kcal or an off-plan report — telling
 * the coach about an off-plan day is still keeping the log. */
function isLogged(log: NutritionLogDay): boolean {
  return log.kcal != null || log.off_plan;
}

function loggedDates(logs: NutritionLogDay[]): Set<string> {
  return new Set(logs.filter(isLogged).map((l) => l.log_date));
}

/** Logged / total days over an inclusive [from, to] range, plus streaks.
 * The current streak counts back from `to`, or from the day before when
 * `to` isn't logged yet (the client may still log today). `from` should
 * already be clamped to when coaching started; days before it aren't
 * "missed". */
export function nutritionAdherence(logs: NutritionLogDay[], range: { from: string; to: string }): NutritionAdherence {
  const dates = loggedDates(logs);
  const inRange = logs.filter((l) => isLogged(l) && l.log_date >= range.from && l.log_date <= range.to);

  const totalDays = range.from > range.to ? 0 : Math.round((toUtc(range.to) - toUtc(range.from)) / 86_400_000) + 1;
  const loggedDays = new Set(inRange.map((l) => l.log_date)).size;
  const offPlanDays = inRange.filter((l) => l.off_plan).length;

  let cursor = dates.has(range.to) ? range.to : addDays(range.to, -1);
  let currentStreak = 0;
  while (dates.has(cursor)) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...dates].sort();
  let longestStreak = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && addDays(sorted[i - 1], 1) === sorted[i] ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }

  return {
    loggedDays,
    totalDays,
    offPlanDays,
    rate: totalDays > 0 ? Math.round((loggedDays / totalDays) * 100) : null,
    currentStreak,
    longestStreak,
  };
}

/** Per-day status for a calendar over an inclusive [from, to] range. Days
 * after `today` are "future", not "missed". */
export function dayStatuses(
  logs: NutritionLogDay[],
  range: { from: string; to: string },
  today: string
): { date: string; status: DayStatus }[] {
  const byDate = new Map(logs.map((l) => [l.log_date, l]));
  const days: { date: string; status: DayStatus }[] = [];
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    const log = byDate.get(date);
    let status: DayStatus;
    if (log?.off_plan) status = "off_plan";
    else if (log && isLogged(log)) status = "logged";
    else if (date > today) status = "future";
    else status = "missed";
    days.push({ date, status });
  }
  return days;
}

/** "YYYY-MM" from a `?month=` param, falling back to `today`'s month for
 * anything malformed. */
export function parseMonth(value: string | undefined, today: string): string {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : today.slice(0, 7);
}

/** Inclusive first/last ISO dates of a "YYYY-MM" month. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Blank cells before the 1st in a 7-column grid whose first column is
 * `weekStart` (0 = Sunday … 6 = Saturday). */
export function leadingBlanks(firstDay: string, weekStart: number): number {
  const weekday = new Date(toUtc(firstDay)).getUTCDay();
  return (weekday - weekStart + 7) % 7;
}
