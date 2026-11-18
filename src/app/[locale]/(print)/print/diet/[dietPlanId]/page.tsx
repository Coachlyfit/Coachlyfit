import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";
import { planMacros, mealMacros, formatServing, itemMacros } from "@/domain/nutrition/macros";
import { dayTargets } from "@/domain/nutrition/diet-days";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { PrintButton } from "@/components/print/print-button";
import { itemMacroFood } from "@/domain/recipes/recipe-nutrition";

export default async function PrintDietPlanPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; dietPlanId: string }>;
}) {
  const { locale, dietPlanId } = await params;
  const t = await getTranslations("print");
  const tDiets = await getTranslations("diets");
  const tBuilder = await getTranslations("diets.builder");
  const tMacros = await getTranslations("diets.macros");
  const tRecipeItem = await getTranslations("recipes.item");
  const supabase = await createClient();

  const tree = await new DietPlansService(supabase).getTree(dietPlanId);
  if (!tree) notFound();

  const clientName = tree.client_id
    ? (await supabase.from("clients").select("display_name").eq("id", tree.client_id).single()).data
        ?.display_name
    : null;

  // Each day-type prints as its own block (meals, totals against that day's
  // targets). A single-day plan prints exactly as it did before days existed.
  const days = tree.diet_plan_days;
  const multiDay = days.length > 1;

  return (
    <>
      <PrintButton label={t("button")} />

      <header className="mb-6 border-b border-black pb-4">
        <h1 className="text-2xl font-bold">{pickLocale(tree, locale)}</h1>
        <p className="mt-1 text-sm text-gray-700">
          {clientName ? t("preparedFor", { name: clientName }) : tDiets("template")}
        </p>
        <p className="text-sm text-gray-700">
          {tree.end_date
            ? tDiets("dateRange", { start: formatDate(tree.start_date, locale), end: formatDate(tree.end_date, locale) })
            : `${formatDate(tree.start_date, locale)} · ${tDiets("ongoing")}`}
        </p>
        {(tree.notes_ar || tree.notes_en) && (
          <p className="mt-1 text-sm text-gray-700">{pickLocale(tree, locale, "notes")}</p>
        )}
      </header>

      <div className="flex flex-col gap-10">
        {days.map((day) => {
          const meals = tree.meals.filter((m) => m.diet_plan_day_id === day.id);
          const totals = planMacros(
            meals.map((meal) => meal.meal_items.map((item) => ({ quantity: item.quantity, food: itemMacroFood(item) })))
          );
          const { target_kcal } = dayTargets(day, tree);
          return (
            <div key={day.id} className="flex flex-col gap-6">
              <div className="border-b border-gray-400 pb-2">
                {multiDay && <h2 className="text-xl font-bold">{pickLocale(day, locale)}</h2>}
                <p className="font-mono text-sm tabular-nums">
                  {t("planTotals")}: {Math.round(totals.kcal)}
                  {target_kcal != null && ` / ${target_kcal}`} {tMacros("kcal")} · {totals.protein_g}g {tMacros("protein")} ·{" "}
                  {totals.carb_g}g {tMacros("carbs")} · {totals.fat_g}g {tMacros("fat")}
                </p>
                {(day.notes_ar || day.notes_en) && (
                  <p className="mt-1 text-sm text-gray-700">{pickLocale(day, locale, "notes")}</p>
                )}
              </div>

              {meals.map((meal) => {
                const mealTotals = mealMacros(
                  meal.meal_items.map((item) => ({ quantity: item.quantity, food: itemMacroFood(item) }))
                );
                return (
                  <section key={meal.id} className="break-inside-avoid">
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-lg font-semibold">
                        {meal.label_ar || meal.label_en ? pickLocale(meal, locale, "label") : tBuilder("untitledMeal")}
                        {meal.time_of_day && (
                          <span className="ms-2 font-mono text-xs font-normal text-gray-600">
                            {meal.time_of_day.slice(0, 5)}
                          </span>
                        )}
                      </h3>
                      {meal.meal_items.length > 0 && (
                        <span className="font-mono text-xs tabular-nums text-gray-600">
                          {Math.round(mealTotals.kcal)} {tMacros("kcal")}
                        </span>
                      )}
                    </div>
                    {meal.meal_items.length === 0 ? (
                      <p className="mt-1 text-sm text-gray-500">{tBuilder("noItems")}</p>
                    ) : (
                      <table className="mt-2 w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-gray-400 text-start">
                            <th className="py-1 text-start font-medium">{tDiets("itemDialog.food")}</th>
                            <th className="py-1 text-start font-medium">{t("quantity")}</th>
                            <th className="py-1 text-start font-medium">{tMacros("kcal")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {meal.meal_items.map((item) => (
                            <tr key={item.id} className="border-b border-gray-200">
                              <td className="py-1.5">
                                {pickLocale(item.foods ?? item.recipes, locale)}
                                {item.recipes && (
                                  <span className="ms-1.5 text-xs text-gray-600">({tRecipeItem("recipe")})</span>
                                )}
                              </td>
                              <td className="py-1.5 tabular-nums">
                                {item.recipes
                                  ? tRecipeItem("servings", { count: item.quantity })
                                  : formatServing(item.quantity, item.foods?.serving_label)}
                              </td>
                              <td className="py-1.5 tabular-nums">
                                {Math.round(itemMacros(item.quantity, itemMacroFood(item)).kcal)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </section>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
