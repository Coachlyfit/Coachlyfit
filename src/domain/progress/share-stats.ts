import type { Database } from "@/lib/supabase/database.types";
import { adherenceAverage } from "./stats";

type CheckinRow = Database["public"]["Tables"]["checkins"]["Row"];
export type ShareCheckin = Pick<CheckinRow, "checkin_date" | "weight" | "adherence">;

const DAY_MS = 86_400_000;

/** Whole weeks between the oldest and newest photo, never below 1. The card
 * reads "Week 1 → Week N" with N = this number, so a 12-week span labels the
 * after photo "Week 12". */
export function weeksBetween(oldestISO: string, newestISO: string): number {
  const days = (new Date(newestISO).getTime() - new Date(oldestISO).getTime()) / DAY_MS;
  return Math.max(1, Math.round(days / 7));
}

const day = (iso: string) => iso.slice(0, 10);

/** Check-ins that fall inside the photo window (inclusive, by calendar day). */
export function inWindow(checkins: ShareCheckin[], fromISO: string, toISO: string): ShareCheckin[] {
  const from = day(fromISO);
  const to = day(toISO);
  return checkins.filter((c) => c.checkin_date >= from && c.checkin_date <= to);
}

/** Last weight minus first weight inside the window; null with fewer than two
 * weight readings (a single reading is not a change). Rounded to 0.1. */
export function weightDelta(checkins: ShareCheckin[], fromISO: string, toISO: string): number | null {
  const weighed = inWindow(checkins, fromISO, toISO)
    .filter((c): c is ShareCheckin & { weight: number } => c.weight != null)
    .sort((a, b) => (a.checkin_date < b.checkin_date ? -1 : a.checkin_date > b.checkin_date ? 1 : 0));
  if (weighed.length < 2) return null;
  const delta = weighed[weighed.length - 1].weight - weighed[0].weight;
  return Math.round(delta * 10) / 10;
}

/** Mean adherence (0-100) inside the window, null when nothing was recorded. */
export function adherenceInWindow(checkins: ShareCheckin[], fromISO: string, toISO: string): number | null {
  return adherenceAverage(inWindow(checkins, fromISO, toISO));
}

export type HeroModel =
  | { kind: "weight"; delta: number; withDuration: boolean }
  | { kind: "duration"; weeks: number }
  | { kind: "report" };

/** What the big number says: weight change when it is on and known, else the
 * duration, else a plain title so the card never shows an empty hero. */
export function heroModel(input: {
  showWeight: boolean;
  showDuration: boolean;
  delta: number | null;
  weeks: number;
}): HeroModel {
  if (input.showWeight && input.delta != null) {
    return { kind: "weight", delta: input.delta, withDuration: input.showDuration };
  }
  if (input.showDuration) return { kind: "duration", weeks: input.weeks };
  return { kind: "report" };
}
