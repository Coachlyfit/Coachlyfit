// Pure helpers for the productivity view. The counts come from
// task_productivity() (20261020000003); the only arithmetic here is turning
// them into rates and a readable duration.

export const PRODUCTIVITY_RANGES = ["7d", "30d", "90d", "custom"] as const;
export type ProductivityRange = (typeof PRODUCTIVITY_RANGES)[number];

const PRESET_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function addDays(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The inclusive "YYYY-MM-DD" window for a range. A preset ends today and
 * spans that many days. "custom" uses the given dates; if either is missing,
 * malformed or they are out of order, it falls back to the last 30 days
 * rather than erroring on a hand-edited URL. */
export function resolveRange(
  range: ProductivityRange,
  today: string,
  from?: string,
  to?: string
): { range: ProductivityRange; from: string; to: string } {
  if (range === "custom") {
    if (from && to && YMD.test(from) && YMD.test(to) && from <= to) return { range, from, to };
    range = "30d";
  }
  return { range, from: addDays(today, -(PRESET_DAYS[range] - 1)), to: today };
}

export type ProductivityCounts = {
  assigned: number;
  completed: number;
  completedWithDue: number;
  completedOnTime: number;
  overdue: number;
  /** null when nothing was completed. */
  avgCompletionSeconds: number | null;
};

export const NO_COUNTS: ProductivityCounts = {
  assigned: 0,
  completed: 0,
  completedWithDue: 0,
  completedOnTime: 0,
  overdue: 0,
  avgCompletionSeconds: null,
};

/** 0..1, or null when there is nothing to divide by -- "no data" is not 0%. */
export function completionRate(counts: ProductivityCounts): number | null {
  return counts.assigned > 0 ? counts.completed / counts.assigned : null;
}

/** Share of completed tasks that had a due date and met it. */
export function onTimeRate(counts: ProductivityCounts): number | null {
  return counts.completedWithDue > 0 ? counts.completedOnTime / counts.completedWithDue : null;
}

/** Team total. The average completion time is weighted by each member's
 * completed count, so it is the average over tasks, not over people. */
export function sumCounts(rows: ProductivityCounts[]): ProductivityCounts {
  const total = { ...NO_COUNTS };
  let seconds = 0;
  for (const row of rows) {
    total.assigned += row.assigned;
    total.completed += row.completed;
    total.completedWithDue += row.completedWithDue;
    total.completedOnTime += row.completedOnTime;
    total.overdue += row.overdue;
    if (row.avgCompletionSeconds !== null) seconds += row.avgCompletionSeconds * row.completed;
  }
  total.avgCompletionSeconds = total.completed > 0 ? seconds / total.completed : null;
  return total;
}

/** Hours up to two days, whole days after; never less than 1 of the unit. */
export function durationParts(seconds: number): { unit: "hours" | "days"; count: number } {
  const hours = seconds / 3600;
  if (hours < 48) return { unit: "hours", count: Math.max(1, Math.round(hours)) };
  return { unit: "days", count: Math.round(hours / 24) };
}
