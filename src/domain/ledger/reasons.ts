import type { Signal } from "./signals";

/** Matches the `reason_key` check constraint on coaching_decisions
 * (20260925000001_coaching_decisions.sql) — a fixed key list, not free
 * text, so every reason renders correctly in both Arabic and English (see
 * this module's callers, which look up `review.reason.<key>`). */
export const REASON_KEYS = [
  "protect_joint",
  "recover_fatigue",
  "rebuild_consistency",
  "progress_ready",
  "technique_focus",
  "schedule_fit",
  "other",
] as const;

export type ReasonKey = (typeof REASON_KEYS)[number];

/** Pre-selects a sensible default reason chip from the strongest evidence
 * on hand, so the coach usually just confirms it rather than picking from
 * scratch — pain outranks missed reps (a safety signal over a performance
 * one), and a repeated note alone (no program_item to act on) falls back
 * to "other" rather than guessing. */
export function suggestReason(signals: Signal[]): ReasonKey {
  if (signals.some((s) => s.kind === "pain_repeat")) return "protect_joint";
  if (signals.some((s) => s.kind === "missed_reps")) return "recover_fatigue";
  return "other";
}
