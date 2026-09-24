import type { SimilarNote } from "@/domain/progress/note-similarity";

/** Evidence the platform notices on its own from data it already collects
 * — nothing here is stored (see the migration's header comment): these are
 * derived on read from workout_exercise_results/workout_set_logs/checkins,
 * same "compute from history" approach as prs.ts/stats.ts. Keyed by
 * `program_item_id`, not a resolved exercise identity: that's what the
 * review console's ExerciseMultiSelect and the structured adjustments
 * (reduceLoad/removeMovement itemIds) already operate on, so a signal
 * plugs straight into the existing adjustment picker with no extra
 * resolution step. A signal that survives to a coach decision gets
 * snapshotted onto `coaching_decisions.evidence` (jsonb) — this is the
 * shape stored there, so it stays a source of truth for outcomes.ts even
 * if later logs change the live picture. */
export type Signal =
  | { kind: "pain_repeat"; programItemId: string; count: number; lastAt: string; detail: { maxPain: number } }
  | { kind: "missed_reps"; programItemId: string; count: number; lastAt: string; detail: { missed: number; total: number } }
  | { kind: "repeated_note"; count: number; lastAt: string; detail: { notes: string[] } };

export type SignalKind = Signal["kind"];

export type ResultRow = {
  program_item_id: string;
  session_id: string;
  pain: number | null;
  created_at: string;
};

export type SetLogRow = {
  program_item_id: string;
  session_id: string;
  reps: number | null;
  prescribed_reps: number | null;
  completed_at: string;
};

const PAIN_REPEAT_WINDOW_DAYS = 14;
const PAIN_REPEAT_MIN_SESSIONS = 2;
const MISSED_REPS_MIN_HALF = 0.5;

function isoDaysAgo(now: Date, days: number): number {
  return now.getTime() - days * 24 * 60 * 60 * 1000;
}

/** Same exercise (program_item) reporting pain > 0 in 2+ distinct sessions
 * within the window — one bad session is normal soreness; two is a
 * pattern worth the coach's attention. Distinct SESSIONS, not rows: a
 * client re-opening the feedback sheet can't inflate the count. */
export function detectPainRepeat(results: ResultRow[], now: Date, windowDays = PAIN_REPEAT_WINDOW_DAYS): Signal[] {
  const cutoff = isoDaysAgo(now, windowDays);
  const byItem = new Map<string, ResultRow[]>();
  for (const r of results) {
    if (r.pain == null || r.pain <= 0) continue;
    if (Date.parse(r.created_at) < cutoff) continue;
    const bucket = byItem.get(r.program_item_id);
    if (bucket) bucket.push(r);
    else byItem.set(r.program_item_id, [r]);
  }

  const signals: Signal[] = [];
  for (const [programItemId, rows] of byItem) {
    const distinctSessions = new Set(rows.map((r) => r.session_id));
    if (distinctSessions.size < PAIN_REPEAT_MIN_SESSIONS) continue;
    const maxPain = Math.max(...rows.map((r) => r.pain!));
    const lastAt = rows.reduce((latest, r) => (r.created_at > latest ? r.created_at : latest), rows[0].created_at);
    signals.push({ kind: "pain_repeat", programItemId, count: distinctSessions.size, lastAt, detail: { maxPain } });
  }
  return signals;
}

/** In the exercise's last 2 sessions, at least half the sets missed their
 * target reps — a coach skimming the review queue won't notice a set-by-set
 * shortfall the way they'd notice a big weight drop. Only sets with both
 * `reps` and `prescribed_reps` logged count; a bodyweight/reps-only set
 * with no prescription on record is excluded, not treated as a miss. */
export function detectMissedReps(logs: SetLogRow[]): Signal[] {
  const byItem = new Map<string, SetLogRow[]>();
  for (const log of logs) {
    if (log.reps == null || log.prescribed_reps == null) continue;
    const bucket = byItem.get(log.program_item_id);
    if (bucket) bucket.push(log);
    else byItem.set(log.program_item_id, [log]);
  }

  const signals: Signal[] = [];
  for (const [programItemId, itemLogs] of byItem) {
    const sessionEarliest = new Map<string, number>();
    for (const log of itemLogs) {
      const at = Date.parse(log.completed_at);
      const prev = sessionEarliest.get(log.session_id);
      if (prev == null || at < prev) sessionEarliest.set(log.session_id, at);
    }
    const lastTwoSessionIds = [...sessionEarliest.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(-2)
      .map(([id]) => id);
    if (lastTwoSessionIds.length < 2) continue;

    const relevant = itemLogs.filter((l) => lastTwoSessionIds.includes(l.session_id));
    const missed = relevant.filter((l) => l.reps! < l.prescribed_reps!).length;
    const total = relevant.length;
    if (total === 0 || missed / total < MISSED_REPS_MIN_HALF) continue;

    const lastAt = relevant.reduce((latest, l) => (l.completed_at > latest ? l.completed_at : latest), relevant[0].completed_at);
    signals.push({ kind: "missed_reps", programItemId, count: lastTwoSessionIds.length, lastAt, detail: { missed, total } });
  }
  return signals;
}

/** Wraps note-similarity.ts's existing repeated-complaint detector as
 * evidence — it's the review console's "said this before" section, just
 * surfaced as a Signal alongside the others instead of living apart from
 * them. Evidence only: unlike pain/missed-reps, a repeated note has no
 * program_item to attach an outcome check to, so outcomes.ts never
 * evaluates it. */
export function repeatedNoteSignal(similarNotes: SimilarNote[]): Signal | null {
  if (similarNotes.length === 0) return null;
  const lastAt = similarNotes.reduce((latest, n) => (n.checkin_date > latest ? n.checkin_date : latest), similarNotes[0].checkin_date);
  return { kind: "repeated_note", count: similarNotes.length, lastAt, detail: { notes: similarNotes.map((n) => n.text) } };
}
