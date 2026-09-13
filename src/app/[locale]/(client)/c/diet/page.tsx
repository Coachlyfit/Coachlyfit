import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";
import { planMacros } from "@/domain/nutrition/macros";
import { pickLocale, type AppLocale } from "@/domain/locale";

/** Much simpler than c/plan/page.tsx: meals have no day_index/cycle concept
 * (a flat ordered list that applies every day, not a rotating training-day
 * schedule), so there is no program-cycle.ts-equivalent date math here --
 * just the plan's meals, in order. */
export default async function ClientDietPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("client.diet");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: clientRow } = await supabase.from("clients").select("id").eq("profile_id", user!.id).single();
  if (!clientRow) {
    throw new Error("Client profile not found for authenticated user.");
  }
  const tree = await new DietPlansService(supabase).getActiveTreeForClient(clientRow.id);

  if (!tree) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <Card>
          <EmptyState brandMark title={t("noPlan")} description={t("noPlanBody")} />
        </Card>
      </div>
    );
  }

  const totals = planMacros(
    tree.meals.map((meal) => meal.meal_items.map((item) => ({ quantity: item.quantity, food: item.foods })))
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{pickLocale(tree, locale)}</h1>
        <p className="text-sm text-muted-foreground">
          {Math.round(totals.kcal)} kcal · {totals.protein_g}g P · {totals.carb_g}g C · {totals.fat_g}g F
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {tree.meals.map((meal) => (
          <Card key={meal.id}>
            <CardContent className="flex flex-col gap-3 py-4">
              <h2 className="text-sm font-semibold">{pickLocale(meal, locale, "label")}</h2>
              {meal.meal_items.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {meal.meal_items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>{pickLocale(item.foods, locale)}</span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {t("quantityUnit", { quantity: item.quantity, unit: item.unit })} ·{" "}
                        {Math.round((item.foods?.kcal ?? 0) * item.quantity)}kcal
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
