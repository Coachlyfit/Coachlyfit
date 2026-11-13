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
    // Assisted sets (stored with a negative weight) are not load lifted.
    if (log.weight != null && log.weight > 0 && log.reps != null) totalVolume += log.weight * log.reps;
  }
  return { totalVolume, setsCompleted: logs.length };
}

export type SessionTotals = { totalDurationSeconds: number; totalDistanceM: number; totalCalories: number };

/** Time-under-effort, distance and calories across a session's sets — shown
 * on the finish screen next to volume. Not persisted on workout_sessions
 * (computed from the logs already in memory), unlike totalVolume above. */
export function computeSessionTotals(
  logs: { duration_seconds?: number | null; distance_m?: number | null; calories?: number | null }[]
): SessionTotals {
  const totals: SessionTotals = { totalDurationSeconds: 0, totalDistanceM: 0, totalCalories: 0 };
  for (const log of logs) {
    totals.totalDurationSeconds += log.duration_seconds ?? 0;
    totals.totalDistanceM += log.distance_m ?? 0;
    totals.totalCalories += log.calories ?? 0;
  }
  return totals;
}
