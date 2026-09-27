import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";
import { ProgramsService } from "@/domain/programs/programs.service";
import { resolveDayPlan } from "@/domain/programs/day-plan";
import { planMacros, targetDelta } from "@/domain/nutrition/macros";
import { pickLocale, type AppLocale } from "@/domain/locale";

/** Today's linked nutrition variant (day-plan.ts's dietPlanId, resolved off
 * the client's active program) takes priority over the standalone plan --
 * a program-owned "Training day"/"Rest day" variant is what the coach
 * actually meant for today. Falls back to the standalone active plan
 * (DietPlansService.getActiveTreeForClient) only when today's day has no
 * linked variant, e.g. a client with no program at all, or a program whose
 * days were never assigned nutrition. Meals themselves still have no
 * day_index/cycle concept of their own -- once a tree is picked, it's just
 * that plan's meals in order, same as before. */
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

  const todayIso = new Date().toISOString().slice(0, 10);
  const dietPlansService = new DietPlansService(supabase);
  const programTree = await new ProgramsService(supabase).getActiveTreeForClient(clientRow.id);
  const todayDietPlanId = programTree ? resolveDayPlan(programTree, todayIso).dietPlanId : null;

  const tree = todayDietPlanId
    ? await dietPlansService.getTree(todayDietPlanId)
    : await dietPlansService.getActiveTreeForClient(clientRow.id);

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
  const delta = targetDelta(totals, tree);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{pickLocale(tree, locale)}</h1>
        <p className="text-sm text-muted-foreground">
          {Math.round(totals.kcal)}
          {tree.target_kcal != null && ` / ${tree.target_kcal}`} kcal · {totals.protein_g}g P · {totals.carb_g}g C ·{" "}
          {totals.fat_g}g F
        </p>
        {delta.kcal != null && (
          <p className={`text-xs ${delta.kcal > 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {t("targetDelta", { delta: delta.kcal > 0 ? `+${delta.kcal}` : String(delta.kcal) })}
          </p>
        )}
        {(tree.notes_ar || tree.notes_en) && (
          <p className="mt-2 text-sm text-muted-foreground">{pickLocale(tree, locale, "notes")}</p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {tree.meals.map((meal) => (
          <Card key={meal.id}>
            <CardContent className="flex flex-col gap-3 py-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{pickLocale(meal, locale, "label")}</h2>
                {meal.time_of_day && (
                  <span className="font-mono text-xs text-muted-foreground">{meal.time_of_day.slice(0, 5)}</span>
                )}
              </div>
              {meal.meal_items.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {meal.meal_items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{pickLocale(item.foods, locale)}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
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
