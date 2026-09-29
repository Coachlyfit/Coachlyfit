import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { DietPlansService, type DietPlanTree } from "@/domain/nutrition/diet-plans.service";
import { ProgramsService } from "@/domain/programs/programs.service";
import { resolveDayPlan } from "@/domain/programs/day-plan";
import { formatServing, itemMacros, mealMacros, planMacros } from "@/domain/nutrition/macros";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { DietDays, type DayView, type PlanView } from "./diet-days";

const DAYS_AHEAD = 7;

/** Flattens a tree into exactly what the client screen renders — localized
 * names, "150g"-style amounts, precomputed totals — so the interactive
 * part (diet-days.tsx) gets small serializable props, not the raw tree. */
function toPlanView(tree: DietPlanTree, locale: AppLocale): PlanView {
  const meals = tree.meals.map((meal) => {
    const items = meal.meal_items.map((item) => ({ quantity: item.quantity, food: item.foods }));
    return {
      id: meal.id,
      label: meal.label_ar || meal.label_en ? pickLocale(meal, locale, "label") : null,
      time: meal.time_of_day?.slice(0, 5) ?? null,
      totals: mealMacros(items),
      items: meal.meal_items.map((item) => ({
        id: item.id,
        name: pickLocale(item.foods, locale),
        amount: formatServing(item.quantity, item.foods?.serving_label),
        kcal: Math.round(itemMacros(item.quantity, item.foods).kcal),
      })),
    };
  });
  return {
    id: tree.id,
    name: pickLocale(tree, locale),
    notes: tree.notes_ar || tree.notes_en ? pickLocale(tree, locale, "notes") : null,
    // Only the four target fields -- not the tree, which would ship to the browser whole.
    targets: {
      target_kcal: tree.target_kcal,
      target_protein_g: tree.target_protein_g,
      target_carb_g: tree.target_carb_g,
      target_fat_g: tree.target_fat_g,
    },
    totals: planMacros(tree.meals.map((m) => m.meal_items.map((i) => ({ quantity: i.quantity, food: i.foods })))),
    meals,
  };
}

/** Each of the next 7 days resolves its own nutrition: the program day's
 * linked variant (day-plan.ts's dietPlanId, e.g. "Training day"), else the
 * client's standalone active plan. Only the handful of distinct plans get
 * fetched, then the client component switches days without a round trip. */
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

  const dietPlans = new DietPlansService(supabase);
  const [programTree, standalone] = await Promise.all([
    new ProgramsService(supabase).getActiveTreeForClient(clientRow.id),
    dietPlans.getActiveTreeForClient(clientRow.id),
  ]);

  const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const resolved = Array.from({ length: programTree ? DAYS_AHEAD : 1 }, (_, i) => {
    const date = new Date(todayMs + i * 86_400_000).toISOString().slice(0, 10);
    const plan = programTree ? resolveDayPlan(programTree, date) : null;
    return { date, kind: plan?.kind ?? null, planId: plan?.dietPlanId ?? standalone?.id ?? null };
  });

  const plans = new Map<string, DietPlanTree>();
  if (standalone) plans.set(standalone.id, standalone);
  const missing = [...new Set(resolved.map((d) => d.planId))].filter((id): id is string => !!id && !plans.has(id));
  for (const tree of await Promise.all(missing.map((id) => dietPlans.getTree(id)))) {
    if (tree) plans.set(tree.id, tree);
  }

  if (plans.size === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <Card>
          <EmptyState brandMark title={t("noPlan")} description={t("noPlanBody")} />
        </Card>
      </div>
    );
  }

  const days: DayView[] = resolved.map((d) => ({
    date: d.date,
    weekday: formatDate(d.date, locale, { weekday: "short" }),
    dayNumber: formatDate(d.date, locale, { day: "numeric" }),
    longLabel: formatDate(d.date, locale, { weekday: "long", day: "numeric", month: "short" }),
    kind: d.kind,
    planId: d.planId && plans.has(d.planId) ? d.planId : null,
  }));
  const planViews = Object.fromEntries([...plans.values()].map((tree) => [tree.id, toPlanView(tree, locale)]));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <DietDays days={days} plans={planViews} />
    </div>
  );
}
