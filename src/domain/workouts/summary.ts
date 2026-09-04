/** Pure session-summary math, computed once at completeSession() and
 * persisted on workout_sessions rather than re-aggregated from
 * workout_set_logs on every history-list read (that list can otherwise get
 * expensive as a client's history grows). */

export type SetLogForSummary = { weight: number | null; reps: number | null };

export type SessionSummary = {
  totalVolume: number;
  setsCompleted: number;
};

/** Bodyweight sets (weight null) contribute 0 to volume but still count
 * toward setsCompleted — same "0kg, not excluded" convention as
 * prs.ts's weeklyVolume. */
export function computeSessionSummary(logs: SetLogForSummary[]): SessionSummary {
  let totalVolume = 0;
  for (const log of logs) {
    if (log.weight != null && log.reps != null) totalVolume += log.weight * log.reps;
  }
  return { totalVolume, setsCompleted: logs.length };
}
