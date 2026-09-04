/** Personal records and volume trends computed purely from logged sets —
 * nothing here is stored; it's derived on read from workout_set_logs,
 * same "compute from history, don't cache a running total" approach as
 * checkinStreak/weightTrend in stats.ts. */

export type SetLogForPr = {
  exercise_id: string;
  weight: number | null;
  reps: number | null;
  completed_at: string;
};

export type PersonalRecord = {
  exerciseId: string;
  /** Heaviest weight logged for this exercise at any rep count. */
  maxWeight: { weight: number; reps: number; completedAt: string } | null;
  /** Highest one-rep-max estimate across all logged sets (Epley formula:
   * weight * (1 + reps / 30)), rounded to the nearest 0.5kg — the
   * standard way to compare a 100kg×5 set against a 110kg×1 set on the
   * same scale. Single-rep sets return the raw weight (the formula
   * degenerates to weight * 1 there anyway, stated separately for
   * clarity). */
  estimatedOneRepMax: { value: number; fromWeight: number; fromReps: number; completedAt: string } | null;
};

function epley(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 2) / 2;
}

/** One PersonalRecord per distinct exercise_id present in `logs`. Only sets
 * with both weight and reps recorded count — a bodyweight or
 * reps-only set (weight null) has no PR to compute. */
export function computePersonalRecords(logs: SetLogForPr[]): PersonalRecord[] {
  const byExercise = new Map<string, SetLogForPr[]>();
  for (const log of logs) {
    if (log.weight == null || log.reps == null || log.weight <= 0 || log.reps <= 0) continue;
    const bucket = byExercise.get(log.exercise_id);
    if (bucket) bucket.push(log);
    else byExercise.set(log.exercise_id, [log]);
  }

  const records: PersonalRecord[] = [];
  for (const [exerciseId, sets] of byExercise) {
    let maxWeight: PersonalRecord["maxWeight"] = null;
    let bestOneRm: PersonalRecord["estimatedOneRepMax"] = null;

    for (const set of sets) {
      const weight = set.weight!;
      const reps = set.reps!;

      if (!maxWeight || weight > maxWeight.weight) {
        maxWeight = { weight, reps, completedAt: set.completed_at };
      }

      const oneRm = epley(weight, reps);
      if (!bestOneRm || oneRm > bestOneRm.value) {
        bestOneRm = { value: oneRm, fromWeight: weight, fromReps: reps, completedAt: set.completed_at };
      }
    }

    records.push({ exerciseId, maxWeight, estimatedOneRepMax: bestOneRm });
  }

  return records;
}

/** Only PRs achieved by sets logged after `sinceExclusive` (an ISO
 * timestamp) — used to show "PRs hit this session" on the session summary
 * without recomputing history twice: pass the client's full history and
 * the session's own started_at as the cutoff. */
export function computeRecentPersonalRecords(logs: SetLogForPr[], sinceExclusive: string): PersonalRecord[] {
  const all = computePersonalRecords(logs);
  return all.filter(
    (pr) =>
      (pr.maxWeight && pr.maxWeight.completedAt >= sinceExclusive) ||
      (pr.estimatedOneRepMax && pr.estimatedOneRepMax.completedAt >= sinceExclusive)
  );
}

export type VolumePoint = { weekStart: string; volumeKg: number };

// Monday-anchored ISO week, UTC-normalized — matches program-cycle.ts's
// own date handling so a week boundary here never disagrees with the
// program's own week numbering by a timezone off-by-one.
function isoWeekStart(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

/** Total logged volume (weight × reps, summed) per ISO week, oldest first
 * — the achieved-volume counterpart to volume.ts's *prescribed* volume in
 * the program builder. Bodyweight sets (weight null) contribute 0 rather
 * than being excluded, so a week with only bodyweight work still appears
 * on the chart at 0kg instead of a gap. */
export function weeklyVolume(logs: SetLogForPr[]): VolumePoint[] {
  const byWeek = new Map<string, number>();
  for (const log of logs) {
    const week = isoWeekStart(log.completed_at.slice(0, 10));
    const volume = log.weight != null && log.reps != null ? log.weight * log.reps : 0;
    byWeek.set(week, (byWeek.get(week) ?? 0) + volume);
  }
  return Array.from(byWeek.entries())
    .map(([weekStart, volumeKg]) => ({ weekStart, volumeKg }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
