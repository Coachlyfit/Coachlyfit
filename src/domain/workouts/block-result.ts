import { TIMED_GROUP_KINDS, type TimedGroupKind } from "@/domain/programs/group-config";

/** What the athlete did in one timed group, stored in
 * workout_sessions.block_results under the group's group_key. Which fields are
 * set depends on the kind:
 *   amrap     rounds (+ extra_reps into the next round)
 *   for_time  time_s, rounds done, splits_s (one per round), time_cap_hit
 *   emom      rounds completed
 *   tabata    rounds completed
 * `rx` is true for "as prescribed", false for scaled; absent = not asked. */
export type BlockResult = {
  kind: TimedGroupKind;
  rounds?: number;
  extra_reps?: number;
  time_s?: number;
  rx?: boolean;
  time_cap_hit?: boolean;
  splits_s?: number[];
};

export type BlockResults = Record<string, BlockResult>;

const NUM_KEYS = ["rounds", "extra_reps", "time_s"] as const;

/** Defensive read of the jsonb column (never trust stored shape): drops
 * unknown kinds and anything that is not a finite, non-negative number. */
export function parseBlockResults(raw: unknown): BlockResults {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: BlockResults = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    if (!(TIMED_GROUP_KINDS as readonly string[]).includes(v.kind as string)) continue;
    const result: BlockResult = { kind: v.kind as TimedGroupKind };
    for (const k of NUM_KEYS) {
      const n = v[k];
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) result[k] = n;
    }
    if (typeof v.rx === "boolean") result.rx = v.rx;
    if (typeof v.time_cap_hit === "boolean") result.time_cap_hit = v.time_cap_hit;
    if (Array.isArray(v.splits_s)) {
      result.splits_s = v.splits_s.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0);
    }
    out[key] = result;
  }
  return out;
}

/** One saved score with where and when it happened — the progress list's row. */
export type BlockScoreRow = {
  sessionId: string;
  groupKey: string;
  startedAt: string;
  /** The program day's bilingual label, if it has one. */
  dayLabel: { name_ar: string; name_en: string } | null;
  result: BlockResult;
};

type SessionWithBlocks = {
  id: string;
  started_at: string;
  block_results: unknown;
  program_days: { label_ar: string | null; label_en: string | null } | null;
};

/** Flattens sessions' block_results into rows, newest first. Sessions without
 * any timed-block score contribute nothing. */
export function toBlockScoreRows(sessions: SessionWithBlocks[], limit = 20): BlockScoreRow[] {
  const rows: BlockScoreRow[] = [];
  for (const session of sessions) {
    const label = session.program_days;
    const dayLabel =
      label && (label.label_ar || label.label_en)
        ? { name_ar: label.label_ar ?? label.label_en ?? "", name_en: label.label_en ?? label.label_ar ?? "" }
        : null;
    for (const [groupKey, result] of Object.entries(parseBlockResults(session.block_results))) {
      rows.push({ sessionId: session.id, groupKey, startedAt: session.started_at, dayLabel, result });
    }
  }
  return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
}
