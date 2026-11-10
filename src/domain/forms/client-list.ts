import { isFieldVisible } from "./derive";
import type { FormField } from "./schema";

/** Time estimate is derived from the question count, never stored. */
export const SECONDS_PER_QUESTION = 24;

// ponytail: one fixed zone (the product is Egypt-only, locales are ar-EG/en-EG);
// make it per-coach if the product ever leaves the region.
const APP_TIME_ZONE = "Africa/Cairo";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole minutes, at least 1; callers show "under a minute" for 0. */
export function estimateSeconds(questionCount: number): number {
  return Math.max(0, questionCount) * SECONDS_PER_QUESTION;
}

export type TimeEstimate = { kind: "underMinute" } | { kind: "minutes"; minutes: number };

export function estimateTime(questionCount: number): TimeEstimate {
  const seconds = estimateSeconds(questionCount);
  if (seconds < 60) return { kind: "underMinute" };
  return { kind: "minutes", minutes: Math.round(seconds / 60) };
}

/** Questions a client actually answers: visible, non-section fields. */
export function countQuestions(fields: FormField[], answers: Record<string, unknown> = {}): number {
  return fields.filter((f) => f.type !== "section" && isFieldVisible(f, answers)).length;
}

/** YYYY-MM-DD in the app zone, so "today" doesn't flip at UTC midnight. */
function dayKey(value: Date): string {
  return value.toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE });
}

function dayNumber(value: Date): number {
  return Math.floor(Date.parse(`${dayKey(value)}T00:00:00Z`) / DAY_MS);
}

export type DueStatus =
  | { kind: "none" }
  | { kind: "today" }
  | { kind: "upcoming"; days: number }
  | { kind: "overdue"; days: number };

/** Calendar-day comparison: due earlier today is still "today", not overdue. */
export function dueStatus(dueAt: string | null, now: Date): DueStatus {
  if (!dueAt) return { kind: "none" };
  const diff = dayNumber(new Date(dueAt)) - dayNumber(now);
  if (diff === 0) return { kind: "today" };
  return diff > 0 ? { kind: "upcoming", days: diff } : { kind: "overdue", days: -diff };
}

/** Overdue first (most overdue first), then soonest due, undated last; ties
 * fall back to newest assignment. */
export function compareTodo(
  a: { due_at: string | null; assigned_at: string },
  b: { due_at: string | null; assigned_at: string }
): number {
  if (a.due_at && b.due_at) {
    const byDue = Date.parse(a.due_at) - Date.parse(b.due_at);
    if (byDue !== 0) return byDue;
  } else if (a.due_at || b.due_at) {
    return a.due_at ? -1 : 1;
  }
  return Date.parse(b.assigned_at) - Date.parse(a.assigned_at);
}

/** Fraction (0..1) of the visible questions already answered in a draft. */
export function draftProgress(fields: FormField[], answers: Record<string, unknown>): number {
  const visible = fields.filter((f) => f.type !== "section" && isFieldVisible(f, answers));
  if (visible.length === 0) return 0;
  const answered = visible.filter((f) => {
    const v = answers[f.id];
    return !(v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0));
  }).length;
  return answered / visible.length;
}

/** Last 7 days (oldest first, today last): did the client submit this form
 * that day? Null unless it was submitted on at least 2 distinct days in the
 * window, i.e. it behaves like a daily form — a streak on a one-off intake
 * would be noise. */
export function streakDays(submittedAts: string[], now: Date): boolean[] | null {
  const today = dayNumber(now);
  const days = new Set(submittedAts.map((s) => dayNumber(new Date(s))));
  const window = Array.from({ length: 7 }, (_, i) => days.has(today - 6 + i));
  return window.filter(Boolean).length >= 2 ? window : null;
}

/** Consecutive days ending today (or yesterday, if not yet submitted today). */
export function streakLength(submittedAts: string[], now: Date): number {
  const days = new Set(submittedAts.map((s) => dayNumber(new Date(s))));
  let cursor = dayNumber(now);
  if (!days.has(cursor)) cursor -= 1;
  let n = 0;
  while (days.has(cursor)) {
    n += 1;
    cursor -= 1;
  }
  return n;
}
