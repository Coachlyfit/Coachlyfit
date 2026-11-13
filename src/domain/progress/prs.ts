/** Personal records and volume trends computed purely from logged sets —
 * nothing here is stored; it's derived on read from workout_set_logs,
 * same "compute from history, don't cache a running total" approach as
 * checkinStreak/weightTrend in stats.ts. */

/** How a lift's one-rep max can be estimated. Olympic lifts (snatch, clean,
 * jerk) are explosive and technical: a 5-rep set says little about a max, so
 * only sets of 1-3 reps are used. Everything else uses sets of up to 12 reps. */
export type LiftKind = "standard" | "olympic";

export type SetLogForPr = {
  exercise_id: string;
  weight: number | null;
  reps: number | null;
  completed_at: string;
  /** Absent = standard. */
  lift?: LiftKind;
};

/** Exercise name -> LiftKind. Name-based on purpose: it keeps the PR maths free
 * of a schema column for what is a small, stable set of lifts. */
export function liftKindFromName(name: string | null | undefined): LiftKind {
  return /\b(snatch|clean|jerk)\b/i.test(name ?? "") ? "olympic" : "standard";
}

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

export function epley(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 2) / 2;
}

const MAX_REPS_FOR_ESTIMATE = { standard: 12, olympic: 3 } as const;

/** One-rep-max estimate for a set, or null when the set is too far from a max
 * effort to say anything (a 20-rep set, or 5 reps of a snatch). Epley within the
 * usable range. Such sets still count for "heaviest weight" and volume — they
 * just do not feed the 1RM estimate. */
export function estimateOneRepMax(weight: number, reps: number, lift: LiftKind = "standard"): number | null {
  if (weight <= 0 || reps <= 0 || reps > MAX_REPS_FOR_ESTIMATE[lift]) return null;
  return epley(weight, reps);
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

      const oneRm = estimateOneRepMax(weight, reps, set.lift);
      if (oneRm != null && (!bestOneRm || oneRm > bestOneRm.value)) {
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

export type SetLogForMeasure = {
  exercise_id: string;
  reps?: number | null;
  duration_seconds?: number | null;
  distance_m?: number | null;
  calories?: number | null;
};

/** Best non-weight results for one exercise — what a plank, a run, a row or a
 * pull-up is judged on. `bestPace` is seconds per km (lower is better) and
 * only counts sets that carry both a duration and a distance. */
export type MeasureRecord = {
  exerciseId: string;
  maxReps: number | null;
  maxDuration: number | null;
  maxDistance: number | null;
  bestPace: number | null;
  maxCalories: number | null;
  totalDistanceM: number;
  totalDurationSeconds: number;
};

/** Below this a "pace" is GPS/typing noise (a 20 m set timed at 3 s is not a
 * 2:30/km run). */
const MIN_PACE_DISTANCE_M = 100;

/** One MeasureRecord per exercise that has at least one reps/duration/
 * distance/calories value. Complements computePersonalRecords, which only
 * ever looks at weight × reps. */
export function computeMeasureRecords(logs: SetLogForMeasure[]): MeasureRecord[] {
  const byExercise = new Map<string, MeasureRecord>();
  const best = (current: number | null, next: number | null | undefined, better: (a: number, b: number) => boolean) =>
    next != null && next > 0 && (current == null || better(next, current)) ? next : current;

  for (const log of logs) {
    const rec =
      byExercise.get(log.exercise_id) ??
      ({
        exerciseId: log.exercise_id,
        maxReps: null,
        maxDuration: null,
        maxDistance: null,
        bestPace: null,
        maxCalories: null,
        totalDistanceM: 0,
        totalDurationSeconds: 0,
      } satisfies MeasureRecord);

    const more = (a: number, b: number) => a > b;
    rec.maxReps = best(rec.maxReps, log.reps, more);
    rec.maxDuration = best(rec.maxDuration, log.duration_seconds, more);
    rec.maxDistance = best(rec.maxDistance, log.distance_m, more);
    rec.maxCalories = best(rec.maxCalories, log.calories, more);
    if (log.duration_seconds && log.duration_seconds > 0) rec.totalDurationSeconds += log.duration_seconds;
    if (log.distance_m && log.distance_m > 0) rec.totalDistanceM += log.distance_m;
    if (log.duration_seconds && log.distance_m && log.distance_m >= MIN_PACE_DISTANCE_M) {
      rec.bestPace = best(rec.bestPace, log.duration_seconds / (log.distance_m / 1000), (a, b) => a < b);
    }
    byExercise.set(log.exercise_id, rec);
  }

  return [...byExercise.values()].filter(
    (r) => r.maxReps != null || r.maxDuration != null || r.maxDistance != null || r.maxCalories != null
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
    // Assisted sets (negative weight) are help received, not load lifted.
    const volume = log.weight != null && log.weight > 0 && log.reps != null ? log.weight * log.reps : 0;
    byWeek.set(week, (byWeek.get(week) ?? 0) + volume);
  }
  return Array.from(byWeek.entries())
    .map(([weekStart, volumeKg]) => ({ weekStart, volumeKg }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
