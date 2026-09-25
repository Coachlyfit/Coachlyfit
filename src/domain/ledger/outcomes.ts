import type { ResultRow, SetLogRow, Signal } from "./signals";

export type OutcomeStatus = "resolved" | "persisting" | "worse" | "not_evaluable";

export type OutcomeEvidence = {
  pain?: { sessionsChecked: number; maxPainSince: number };
  missedReps?: { sessionsChecked: number; hitRate: number; priorHitRate: number };
};

export type OutcomeResult = { status: OutcomeStatus; evidence: OutcomeEvidence };

export type DecisionForOutcome = {
  affectedItemIds: string[];
  evidence: Signal[];
  since: string; // applied_at if the decision was applied, else created_at
};

const MIN_SESSIONS = 3;
const NOT_EVALUABLE_AFTER_DAYS = 28;
const MISSED_REPS_RESOLVED_HIT_RATE = 0.9;

function distinctSessionsSince(rows: { session_id: string; at: string }[], sinceMs: number): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (Date.parse(row.at) >= sinceMs) ids.add(row.session_id);
  }
  return ids;
}

function evaluatePain(
  signal: Extract<Signal, { kind: "pain_repeat" }>,
  postResults: ResultRow[],
  sinceMs: number
): { sub: OutcomeStatus | null; evidence: OutcomeEvidence["pain"] } {
  const relevant = postResults.filter((r) => r.program_item_id === signal.programItemId && Date.parse(r.created_at) >= sinceMs);
  const sessions = distinctSessionsSince(
    relevant.map((r) => ({ session_id: r.session_id, at: r.created_at })),
    sinceMs
  );
  if (sessions.size < MIN_SESSIONS) return { sub: null, evidence: undefined };

  const painValues = relevant.map((r) => r.pain ?? 0);
  const maxPainSince = painValues.length > 0 ? Math.max(...painValues) : 0;
  const evidence = { sessionsChecked: sessions.size, maxPainSince };

  if (maxPainSince === 0) return { sub: "resolved", evidence };
  if (maxPainSince >= signal.detail.maxPain) return { sub: "worse", evidence };
  return { sub: "persisting", evidence };
}

function evaluateMissedReps(
  signal: Extract<Signal, { kind: "missed_reps" }>,
  postLogs: SetLogRow[],
  sinceMs: number
): { sub: OutcomeStatus | null; evidence: OutcomeEvidence["missedReps"] } {
  const relevant = postLogs.filter(
    (l) => l.program_item_id === signal.programItemId && l.reps != null && l.prescribed_reps != null && Date.parse(l.completed_at) >= sinceMs
  );
  const sessions = distinctSessionsSince(
    relevant.map((l) => ({ session_id: l.session_id, at: l.completed_at })),
    sinceMs
  );
  if (sessions.size < MIN_SESSIONS) return { sub: null, evidence: undefined };

  const hit = relevant.filter((l) => l.reps! >= l.prescribed_reps!).length;
  const hitRate = relevant.length > 0 ? hit / relevant.length : 0;
  const priorHitRate = 1 - signal.detail.missed / signal.detail.total;
  const evidence = { sessionsChecked: sessions.size, hitRate: Math.round(hitRate * 100) / 100, priorHitRate: Math.round(priorHitRate * 100) / 100 };

  if (hitRate >= MISSED_REPS_RESOLVED_HIT_RATE) return { sub: "resolved", evidence };
  if (hitRate < priorHitRate) return { sub: "worse", evidence };
  return { sub: "persisting", evidence };
}

const STATUS_PRIORITY: Record<OutcomeStatus, number> = { worse: 3, persisting: 2, resolved: 1, not_evaluable: 0 };

/** Re-checks a decision's original evidence against what's happened since
 * it was applied — the loop nothing in this codebase closes today
 * (adjustment_applied_at records the change; nothing looks at whether it
 * worked). Returns null while there isn't enough data yet AND the
 * not-evaluable deadline hasn't passed either — the caller (the outcome
 * cron) should leave the decision `pending` and check again later. Only
 * pain_repeat and missed_reps evidence get an automatic outcome —
 * repeated_note evidence has no program_item to re-check against, so it's
 * excluded from `decision.evidence` before this is called (or simply
 * ignored: a repeated_note-only decision never contributes a sub-status,
 * so `overall` falls through to not_evaluable once the deadline passes). */
export function evaluateOutcome(decision: DecisionForOutcome, postResults: ResultRow[], postLogs: SetLogRow[], now: Date): OutcomeResult | null {
  const sinceMs = Date.parse(decision.since);
  const evidence: OutcomeEvidence = {};
  const subStatuses: OutcomeStatus[] = [];
  let anyPending = false;

  for (const signal of decision.evidence) {
    if (signal.kind === "pain_repeat" && decision.affectedItemIds.includes(signal.programItemId)) {
      const { sub, evidence: painEvidence } = evaluatePain(signal, postResults, sinceMs);
      if (sub == null) anyPending = true;
      else {
        subStatuses.push(sub);
        evidence.pain = painEvidence;
      }
    }
    if (signal.kind === "missed_reps" && decision.affectedItemIds.includes(signal.programItemId)) {
      const { sub, evidence: repsEvidence } = evaluateMissedReps(signal, postLogs, sinceMs);
      if (sub == null) anyPending = true;
      else {
        subStatuses.push(sub);
        evidence.missedReps = repsEvidence;
      }
    }
  }

  const deadlinePassed = now.getTime() - sinceMs >= NOT_EVALUABLE_AFTER_DAYS * 24 * 60 * 60 * 1000;

  if (subStatuses.length === 0) {
    if (!anyPending || deadlinePassed) return { status: "not_evaluable", evidence };
    return null; // still waiting on enough sessions, and not overdue yet
  }
  if (anyPending && !deadlinePassed) return null; // one dimension ready, another still pending — wait for both

  const overall = subStatuses.reduce((worst, s) => (STATUS_PRIORITY[s] > STATUS_PRIORITY[worst] ? s : worst));
  return { status: overall, evidence };
}
