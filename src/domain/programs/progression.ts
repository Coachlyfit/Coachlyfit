import { isDeloadWeek, modifierForWeek, type WeekModifier, type WeekPlan } from "./week-plan";

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
  /** Set targets: upper end of a rep range, %1RM, set type, RPE/RIR. All pass
   * through unchanged except reps_max, which moves with reps. */
  reps_max?: number | null;
  pct_1rm?: number | null;
  set_type?: string;
  rpe_target?: number | null;
  rir_target?: number | null;
};

export const MAX_PROGRAM_WEEKS = 12;

/** Projects week 1's base sets onto `week`. Week 1 always returns the base. A
 * deload week (see isDeloadWeek: authored in `plan`, else every 4th week) also
 * returns the base — a deload is a display-time reset, not a stored state, so
 * it never shifts later weeks' trend: week 5 still progresses as `base + 4
 * steps`, exactly as if week 4 had never deloaded. The week's authored
 * modifiers (load %, rep delta) then apply on top, deload or not.
 * `weight: null` (bodyweight exercises) stays null under weight-based rules and
 * load % — there's nothing to scale. */
export function projectSetsForWeek(
  baseSets: BaseSet[],
  rule: ProgressionRule,
  week: number,
  plan: WeekPlan | null = null
): BaseSet[] {
  const clamped = Math.min(Math.max(Math.round(week), 1), MAX_PROGRAM_WEEKS);
  const progressed =
    clamped === 1 || rule === "none" || isDeloadWeek(plan, clamped)
      ? baseSets.map((set) => ({ ...set }))
      : baseSets.map((set) => projectSet(set, rule, clamped - 1));

  const mod = clamped === 1 ? null : modifierForWeek(plan, clamped);
  return mod ? progressed.map((set) => applyModifier(set, mod)) : progressed;
}

/** Load % scales a real (positive) weight to the nearest 0.5 kg — assisted
 * (negative) weights are left alone, since "60% of the help" is not a lighter
 * week. A rep delta never takes a target below 1. */
function applyModifier(set: BaseSet, mod: WeekModifier): BaseSet {
  const next = { ...set };
  if (mod.load_pct != null && next.weight != null && next.weight > 0) {
    next.weight = Math.round(((next.weight * mod.load_pct) / 100) * 2) / 2;
  }
  if (mod.reps_delta) {
    if (next.reps != null) next.reps = Math.max(1, next.reps + mod.reps_delta);
    if (next.reps_max != null) next.reps_max = Math.max(next.reps ?? 1, next.reps_max + mod.reps_delta);
  }
  return next;
}

function projectSet(set: BaseSet, rule: ProgressionRule, steps: number): BaseSet {
  switch (rule) {
    case "plus_2_5kg_week":
      return { ...set, weight: set.weight == null ? null : set.weight + 2.5 * steps };
    case "plus_5kg_week":
      return { ...set, weight: set.weight == null ? null : set.weight + 5 * steps };
    case "plus_1_rep_week":
      return {
        ...set,
        reps: set.reps == null ? null : set.reps + steps,
        // A range slides as a whole: 8-12 becomes 9-13.
        reps_max: set.reps_max == null ? set.reps_max : set.reps_max + steps,
      };
    default:
      return { ...set };
  }
}
