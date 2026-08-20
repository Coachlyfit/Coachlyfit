"use client";

import { useTranslations } from "next-intl";
import { planMacros, macroPercentages } from "@/domain/nutrition/macros";
import type { DietPlanTree } from "@/domain/nutrition/diet-plans.service";

/** Sums kcal/protein/carb/fat across all meals -- pure derived data from
 * the already-loaded tree, no fetch of its own. Mirrors
 * programs/[programId]/volume-sidebar.tsx's "no separate fetch" pattern,
 * using the already-tested macros.ts functions instead of a new one. */
export function MacroSidebar({ meals }: { meals: DietPlanTree["meals"] }) {
  const t = useTranslations("diets.macros");
  const totals = planMacros(meals.map((meal) => meal.meal_items.map((item) => ({ quantity: item.quantity, food: item.foods }))));
  const percentages = macroPercentages(totals);
  const hasFood = meals.some((meal) => meal.meal_items.length > 0);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold">{t("title")}</h3>
      {!hasFood ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-2xl font-semibold tabular-nums">{Math.round(totals.kcal)}</span>
            <span className="text-xs text-muted-foreground">{t("kcal")}</span>
          </div>
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("protein")} · {percentages.proteinPercent}%
              </span>
              <span className="font-mono tabular-nums">{totals.protein_g}g</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("carbs")} · {percentages.carbPercent}%
              </span>
              <span className="font-mono tabular-nums">{totals.carb_g}g</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("fat")} · {percentages.fatPercent}%
              </span>
              <span className="font-mono tabular-nums">{totals.fat_g}g</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
