export type MacroFood = { kcal: number; protein_g: number; carb_g: number; fat_g: number };
export type MacroTotals = MacroFood;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A meal_item's contribution: the food's per-100g/per-serving macros
 * (foods.kcal/protein_g/carb_g/fat_g) scaled by quantity — quantity is
 * always "how many of the food's own stored serving", so no unit
 * conversion happens here. */
export function itemMacros(quantity: number, food: MacroFood | null | undefined): MacroTotals {
  if (!food) return { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 };
  return {
    kcal: round1(food.kcal * quantity),
    protein_g: round1(food.protein_g * quantity),
    carb_g: round1(food.carb_g * quantity),
    fat_g: round1(food.fat_g * quantity),
  };
}

function sum(totals: MacroTotals[]): MacroTotals {
  return totals.reduce(
    (acc, t) => ({
      kcal: round1(acc.kcal + t.kcal),
      protein_g: round1(acc.protein_g + t.protein_g),
      carb_g: round1(acc.carb_g + t.carb_g),
      fat_g: round1(acc.fat_g + t.fat_g),
    }),
    { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 }
  );
}

export type MealItemLike = { quantity: number; food: MacroFood | null | undefined };

/** Total macros for one meal — the live donut in the meal panel. */
export function mealMacros(items: MealItemLike[]): MacroTotals {
  return sum(items.map((i) => itemMacros(i.quantity, i.food)));
}

/** Total macros for a whole plan — same shape one level up, so the plan
 * header can show the same donut as each meal without re-deriving it. */
export function planMacros(meals: MealItemLike[][]): MacroTotals {
  return sum(meals.map(mealMacros));
}

export type MacroPercentages = { proteinPercent: number; carbPercent: number; fatPercent: number };

/** Kcal-per-gram split (protein 4, carb 4, fat 9) — derived from the macro
 * grams themselves, not the plan's stored `kcal` total, so the three
 * percentages stay internally consistent even when `kcal` has drifted from
 * independently-rounded per-item sums. Each percentage rounds on its own, so
 * the three don't always sum to exactly 100 — same as any donut chart. */
export function macroPercentages(totals: MacroTotals): MacroPercentages {
  const proteinKcal = totals.protein_g * 4;
  const carbKcal = totals.carb_g * 4;
  const fatKcal = totals.fat_g * 9;
  const macroKcal = proteinKcal + carbKcal + fatKcal;

  if (macroKcal === 0) {
    return { proteinPercent: 0, carbPercent: 0, fatPercent: 0 };
  }
  return {
    proteinPercent: Math.round((proteinKcal / macroKcal) * 100),
    carbPercent: Math.round((carbKcal / macroKcal) * 100),
    fatPercent: Math.round((fatKcal / macroKcal) * 100),
  };
}

export type MacroTargets = {
  target_kcal: number | null;
  target_protein_g: number | null;
  target_carb_g: number | null;
  target_fat_g: number | null;
};

/** planned - target for each macro, null wherever the coach hasn't set a
 * target for that one — lets the target editor show "no target" instead of
 * a misleading delta against zero. Positive = over target. */
export function targetDelta(
  totals: MacroTotals,
  targets: MacroTargets
): { kcal: number | null; protein_g: number | null; carb_g: number | null; fat_g: number | null } {
  return {
    kcal: targets.target_kcal == null ? null : round1(totals.kcal - targets.target_kcal),
    protein_g: targets.target_protein_g == null ? null : round1(totals.protein_g - targets.target_protein_g),
    carb_g: targets.target_carb_g == null ? null : round1(totals.carb_g - targets.target_carb_g),
    fat_g: targets.target_fat_g == null ? null : round1(totals.fat_g - targets.target_fat_g),
  };
}

/** Renders a meal_item's amount the way a person reads it. quantity is a
 * multiple of the food's own serving_label (see itemMacros), so a "100g"
 * food at 1.5 reads "150g"; anything not a plain gram/ml amount ("1 cup",
 * "1 slice") reads "1.5 × 1 cup". */
export function formatServing(quantity: number, servingLabel: string | null | undefined): string {
  const label = (servingLabel ?? "").trim();
  const m = /^(\d+(?:\.\d+)?)\s*(g|ml)$/i.exec(label);
  if (m) return `${round1(quantity * Number(m[1]))}${m[2].toLowerCase()}`;
  if (!label) return `× ${quantity}`;
  return quantity === 1 ? label : `${quantity} × ${label}`;
}

export type PlanWarning =
  | { code: "macro_kcal_mismatch"; macroKcal: number; targetKcal: number }
  | { code: "over_target"; delta: number }
  | { code: "under_target"; delta: number }
  | { code: "empty_meal"; mealIndex: number };

const TOLERANCE = 0.1;

/** Coach-facing sanity checks for the builder's day summary. Deliberately
 * only the four that point at a real mistake: targets that contradict
 * themselves (P*4 + C*4 + F*9 far from kcal), a built plan far off its own
 * kcal target, and meals left empty. under_target is skipped while the
 * plan has no food yet — that's "not started", not a mistake. */
export function planWarnings(meals: MealItemLike[][], targets: MacroTargets): PlanWarning[] {
  const warnings: PlanWarning[] = [];
  const { target_kcal, target_protein_g, target_carb_g, target_fat_g } = targets;

  if (target_kcal != null && target_protein_g != null && target_carb_g != null && target_fat_g != null) {
    const macroKcal = Math.round(target_protein_g * 4 + target_carb_g * 4 + target_fat_g * 9);
    if (Math.abs(macroKcal - target_kcal) > target_kcal * TOLERANCE) {
      warnings.push({ code: "macro_kcal_mismatch", macroKcal, targetKcal: target_kcal });
    }
  }

  const hasFood = meals.some((m) => m.length > 0);
  if (target_kcal != null && hasFood) {
    const delta = Math.round(planMacros(meals).kcal - target_kcal);
    if (delta > target_kcal * TOLERANCE) warnings.push({ code: "over_target", delta });
    else if (-delta > target_kcal * TOLERANCE) warnings.push({ code: "under_target", delta });
  }

  meals.forEach((m, mealIndex) => {
    if (m.length === 0) warnings.push({ code: "empty_meal", mealIndex });
  });
  return warnings;
}
