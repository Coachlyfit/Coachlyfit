import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";
import { planMacros, mealMacros } from "@/domain/nutrition/macros";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { PrintButton } from "@/components/print/print-button";

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
  const supabase = await createClient();

  const tree = await new DietPlansService(supabase).getTree(dietPlanId);
  if (!tree) notFound();

  const clientName = tree.client_id
    ? (await supabase.from("clients").select("display_name").eq("id", tree.client_id).single()).data
        ?.display_name
    : null;

  const planTotals = planMacros(
    tree.meals.map((meal) => meal.meal_items.map((item) => ({ quantity: item.quantity, food: item.foods })))
  );

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
        <p className="mt-2 font-mono text-sm tabular-nums">
          {t("planTotals")}: {Math.round(planTotals.kcal)} {tMacros("kcal")} · {planTotals.protein_g}g{" "}
          {tMacros("protein")} · {planTotals.carb_g}g {tMacros("carbs")} · {planTotals.fat_g}g {tMacros("fat")}
        </p>
      </header>

      <div className="flex flex-col gap-6">
        {tree.meals.map((meal) => {
          const totals = mealMacros(meal.meal_items.map((item) => ({ quantity: item.quantity, food: item.foods })));
          return (
            <section key={meal.id} className="break-inside-avoid">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">
                  {meal.label_ar || meal.label_en ? pickLocale(meal, locale, "label") : tBuilder("untitledMeal")}
                </h2>
                {meal.meal_items.length > 0 && (
                  <span className="font-mono text-xs tabular-nums text-gray-600">
                    {Math.round(totals.kcal)} {tMacros("kcal")}
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
                        <td className="py-1.5">{pickLocale(item.foods, locale)}</td>
                        <td className="py-1.5 tabular-nums">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="py-1.5 tabular-nums">{Math.round(item.foods.kcal * item.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
