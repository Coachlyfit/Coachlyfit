export type ProgressionRule = "none" | "plus_2_5kg_week" | "plus_5kg_week" | "plus_1_rep_week";

export type BaseSet = {
  set_index: number;
  /** Null for a set measured by something else (a hold, a distance) — at
   * least one measure is always set, enforced by the DB's
   * program_item_sets_has_measure check. */
  reps: number | null;
  /** Negative = assisted bodyweight, so "+2.5 kg a week" means less help. */
  weight: number | null;
  rest_seconds: number | null;
  /** Prescribed hold/work time; null for a normal reps-based set. Never
   * projected by week — a 30s hold doesn't grow with progression the way
   * reps/weight do, so it passes through unchanged. */
  duration_seconds: number | null;
  /** distance_m / calories / extra are likewise passed through untouched. */
  distance_m?: number | null;
  calories?: number | null;
  extra?: unknown;
};

export const MAX_PROGRAM_WEEKS = 12;
const DELOAD_INTERVAL = 4;

/** Projects week 1's base sets onto `week`. Week 1 and every 4th week (4, 8,
 * 12) always return the base unmodified — a deload is a display-time reset,
 * not a stored state, so it never shifts later weeks' trend: week 5 still
 * progresses as `base + 4 steps`, exactly as if week 4 had never deloaded.
 * `weight: null` (bodyweight exercises) stays null under weight-based rules
 * — there's nothing to add a delta to. */
export function projectSetsForWeek(baseSets: BaseSet[], rule: ProgressionRule, week: number): BaseSet[] {
  const clamped = Math.min(Math.max(Math.round(week), 1), MAX_PROGRAM_WEEKS);
  if (clamped === 1 || rule === "none" || clamped % DELOAD_INTERVAL === 0) {
    return baseSets.map((set) => ({ ...set }));
  }
  const steps = clamped - 1;
  return baseSets.map((set) => projectSet(set, rule, steps));
}

function projectSet(set: BaseSet, rule: ProgressionRule, steps: number): BaseSet {
  switch (rule) {
    case "plus_2_5kg_week":
      return { ...set, weight: set.weight == null ? null : set.weight + 2.5 * steps };
    case "plus_5kg_week":
      return { ...set, weight: set.weight == null ? null : set.weight + 5 * steps };
    case "plus_1_rep_week":
      return { ...set, reps: set.reps == null ? null : set.reps + steps };
    default:
      return { ...set };
  }
}
