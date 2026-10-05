/** A plan whose end date is this many days away or fewer is "ending soon". */
export const ENDING_SOON_DAYS = 7;

export type PlanStatus = "endingSoon" | "active" | "notStarted" | "ended";

/** List order: what needs the coach first. */
export const STATUS_ORDER: readonly PlanStatus[] = ["endingSoon", "active", "notStarted", "ended"];

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to`. Both are `YYYY-MM-DD`, which Date.parse
 * reads as UTC midnight, so there is no timezone or DST drift. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** Derived from the dates, never stored. A plan with no end date can only be
 * "notStarted" or "active". `YYYY-MM-DD` strings compare correctly as text. */
export function planStatus(start: string, end: string | null, today: string): PlanStatus {
  if (start > today) return "notStarted";
  if (end) {
    if (end < today) return "ended";
    if (daysBetween(today, end) <= ENDING_SOON_DAYS) return "endingSoon";
  }
  return "active";
}

export type PlanProgress = {
  /** 1-based day of the plan, 0 before it starts, capped at `total`. */
  day: number;
  /** Plan length in days, both ends inclusive; null when there is no end date. */
  total: number | null;
  /** 0–100; null when there is no end date. */
  pct: number | null;
  /** Days until the start date, 0 once started. */
  startsIn: number;
};

export function planProgress(start: string, end: string | null, today: string): PlanProgress {
  // An end date before the start date is bad data; treat it as a one-day plan.
  const total = end ? Math.max(1, daysBetween(start, end) + 1) : null;
  const day = Math.min(Math.max(0, daysBetween(start, today) + 1), total ?? Infinity);
  return {
    day,
    total,
    pct: total ? Math.round((day / total) * 100) : null,
    startsIn: Math.max(0, daysBetween(today, start)),
  };
}
