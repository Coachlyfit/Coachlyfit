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
