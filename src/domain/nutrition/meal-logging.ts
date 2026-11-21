/** One tap on the water button = one cup. */
export const WATER_CUP_ML = 250;
/** Daily goal when the coach hasn't set one on the plan day. */
export const DEFAULT_WATER_TARGET_ML = 2000;

export type MealStatus = "eaten" | "skipped";

/** The coach's read-only look at a client's last `days` days: meals marked
 * eaten / skipped (an unmarked meal is simply absent, not counted as
 * missed — which meals were due each day depends on that day's plan) and
 * average water per day. */
export function weekSummary(
  completions: { status: string }[],
  water: { amount_ml: number }[],
  days = 7
): { eaten: number; skipped: number; avgWaterMl: number } {
  return {
    eaten: completions.filter((c) => c.status === "eaten").length,
    skipped: completions.filter((c) => c.status === "skipped").length,
    avgWaterMl: Math.round(water.reduce((sum, w) => sum + w.amount_ml, 0) / days),
  };
}
