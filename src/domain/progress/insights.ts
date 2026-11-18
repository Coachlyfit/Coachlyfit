import type { Database } from "@/lib/supabase/database.types";
import type { Signal } from "@/domain/ledger/signals";
import { adherenceAverage, daysSince } from "./stats";

type CheckinRow = Database["public"]["Tables"]["checkins"]["Row"];

/** Only what the rules read — the review page passes full rows, tests pass
 * these four columns. */
export type InsightReading = Pick<CheckinRow, "checkin_date" | "weight" | "sleep_hours" | "adherence">;

export type InsightKey = "pain" | "adherence_low" | "missed_checkins" | "sleep_drop" | "weight_stalled" | "good_week";
export type InsightSeverity = "warn" | "info" | "good";
/** Keys of `review.reply.chips.*` — the three originals plus one per rule. */
export type ReplyChipKey = "weightStalled" | "sleepDrop" | "adherenceLow" | "missedCheckins" | "goodWeek" | "call";

/** Keys and numbers only — the console owns the wording (and the locale). */
export type Insight = {
  key: InsightKey;
  severity: InsightSeverity;
  params: Record<string, number>;
  replyChip: ReplyChipKey | null;
};

// Thresholds. Tune here; nothing below hard-codes a number.
export const WEIGHT_STALL_KG = 0.3; // net change below this = stalled
export const WEIGHT_WINDOW_MIN_DAYS = 10; // reference reading must be 10-18 days back
export const WEIGHT_WINDOW_MAX_DAYS = 18;
export const SLEEP_DROP_HOURS = 1; // vs. the average of recent check-ins
export const SLEEP_BASELINE_COUNT = 4; // most recent prior check-ins that have sleep
export const SLEEP_BASELINE_MIN = 2; // fewer than this = not enough to call it a drop
export const ADHERENCE_LOW = 70;
export const ADHERENCE_DROP_POINTS = 15; // below baseline
export const ADHERENCE_BASELINE_LOOKBACK = 6; // prior check-ins averaged for the baseline
export const MISSED_GAP_DAYS = 10; // gap since the previous check-in
export const GOOD_ADHERENCE = 85;
export const MAX_INSIGHTS = 3;

const SEVERITY_RANK: Record<InsightSeverity, number> = { warn: 0, info: 1, good: 2 };

// `checkin_date` is a naive YYYY-MM-DD; stats.daysSince steps UTC-normalized
// dates, so a day gap between two check-ins never depends on the server's
// timezone or on `now`.
function dayGap(earlier: string, later: string): number {
  return daysSince(earlier, new Date(`${later}T00:00:00Z`));
}

// Subtracting decimals leaves float dust (6.1 - 5.1 = 0.9999999999999996),
// which would flip an exactly-at-threshold comparison.
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function pain(signals: Signal[]): Insight | null {
  const count = signals.filter((s) => s.kind === "pain_repeat").length;
  return count > 0 ? { key: "pain", severity: "warn", params: { count }, replyChip: "call" } : null;
}

function adherenceLow(current: InsightReading, prior: InsightReading[]): Insight | null {
  if (current.adherence == null) return null;
  const baseline = adherenceAverage(prior.slice(-ADHERENCE_BASELINE_LOOKBACK));
  const low = current.adherence < ADHERENCE_LOW;
  const dropped = baseline != null && baseline - current.adherence >= ADHERENCE_DROP_POINTS;
  if (!low && !dropped) return null;
  return { key: "adherence_low", severity: "warn", params: { adherence: current.adherence }, replyChip: "adherenceLow" };
}

function missedCheckins(current: InsightReading, prior: InsightReading[]): Insight | null {
  const previous = prior.at(-1);
  if (!previous) return null;
  const days = dayGap(previous.checkin_date, current.checkin_date);
  if (days <= MISSED_GAP_DAYS) return null;
  return { key: "missed_checkins", severity: "warn", params: { days }, replyChip: "missedCheckins" };
}

function sleepDrop(current: InsightReading, prior: InsightReading[]): Insight | null {
  if (current.sleep_hours == null) return null;
  const recent = prior.filter((c) => c.sleep_hours != null).slice(-SLEEP_BASELINE_COUNT);
  if (recent.length < SLEEP_BASELINE_MIN) return null;
  const avg = recent.reduce((sum, c) => sum + c.sleep_hours!, 0) / recent.length;
  const drop = round2(avg - current.sleep_hours);
  if (drop < SLEEP_DROP_HOURS) return null;
  return {
    key: "sleep_drop",
    severity: "warn",
    params: { drop: round1(drop), hours: current.sleep_hours, avg: round1(avg) },
    replyChip: "sleepDrop",
  };
}

/** Anchored on the check-in's own date (not `now`), so a check-in that waits
 * in the queue doesn't change its answer. Uses the oldest reading inside the
 * window — the longest stretch the data can vouch for. Plain net change; no
 * goal awareness (see plan: `clients` has no goal). */
function weightStalled(current: InsightReading, prior: InsightReading[]): Insight | null {
  if (current.weight == null) return null;
  const reference = prior.find((c) => {
    if (c.weight == null) return false;
    const gap = dayGap(c.checkin_date, current.checkin_date);
    return gap >= WEIGHT_WINDOW_MIN_DAYS && gap <= WEIGHT_WINDOW_MAX_DAYS;
  });
  if (!reference) return null;
  const change = round2(Math.abs(current.weight - reference.weight!));
  if (change >= WEIGHT_STALL_KG) return null;
  const days = dayGap(reference.checkin_date, current.checkin_date);
  return {
    key: "weight_stalled",
    severity: "info",
    params: { weeks: Math.max(1, Math.round(days / 7)), days, change },
    replyChip: "weightStalled",
  };
}

/** At most MAX_INSIGHTS plain-language findings for one pending check-in,
 * most severe first (ties keep rule order below). `history` is every other
 * check-in of the client in any order; only rows before `current` and not
 * after `now` are used. A rule whose inputs are missing is skipped — never
 * guessed. Nothing is stored; call it on read. */
export function buildInsights(
  current: InsightReading,
  history: InsightReading[],
  signals: Signal[],
  now: Date
): Insight[] {
  const today = now.toISOString().slice(0, 10);
  const prior = history
    .filter((c) => c.checkin_date < current.checkin_date && c.checkin_date <= today)
    .sort((a, b) => (a.checkin_date < b.checkin_date ? -1 : a.checkin_date > b.checkin_date ? 1 : 0));

  const found = [
    pain(signals),
    adherenceLow(current, prior),
    missedCheckins(current, prior),
    sleepDrop(current, prior),
    weightStalled(current, prior),
  ].filter((i): i is Insight => i != null);

  if (found.length === 0 && current.adherence != null && current.adherence >= GOOD_ADHERENCE) {
    found.push({ key: "good_week", severity: "good", params: { adherence: current.adherence }, replyChip: "goodWeek" });
  }

  // Array.prototype.sort is stable, so equal severities keep rule order.
  return found.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]).slice(0, MAX_INSIGHTS);
}
