import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { DietPlansService, type DietPlanTree } from "@/domain/nutrition/diet-plans.service";
import { ProgramsService } from "@/domain/programs/programs.service";
import { resolveDayPlan } from "@/domain/programs/day-plan";
import { formatServing, itemMacros, mealMacros, planMacros } from "@/domain/nutrition/macros";
import { itemMacroFood, recipeAsMacroFood } from "@/domain/recipes/recipe-nutrition";
import { RecipesService } from "@/domain/recipes/recipes.service";
import type { RecipeView } from "./recipe-sheet";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { DietDays, type DayView, type PlanView, type TodayLog } from "./diet-days";
import { NutritionLogPanel } from "./nutrition-log-panel";
import { NutritionLogsService } from "@/domain/nutrition/nutrition-logs.service";
import { MealLoggingService } from "@/domain/nutrition/meal-logging.service";
import { DEFAULT_WATER_TARGET_ML, type MealStatus } from "@/domain/nutrition/meal-logging";
import { addDays } from "@/domain/nutrition/adherence";
import { dayTargets, resolveDietDay } from "@/domain/nutrition/diet-days";
import { weekdayOf } from "@/domain/appointments/tz";

const DAYS_AHEAD = 7;
// How far back a log can still be edited (isLoggableDate); the panel offers
// these days plus tomorrow, so each needs its plan day for the stamp.
const LOG_WINDOW_DAYS = 7;

type TreeItem = DietPlanTree["meals"][number]["meal_items"][number];

/** Everything the recipe sheet shows, already localized. */
function toRecipeView(recipe: NonNullable<TreeItem["recipes"]>, locale: AppLocale, imageUrls: Map<string, string>): RecipeView {
  return {
    id: recipe.id,
    name: pickLocale(recipe, locale),
    description: recipe.description,
    imageUrl: recipe.image_path ? (imageUrls.get(recipe.image_path) ?? null) : null,
    prepMinutes: recipe.prep_minutes,
    cookMinutes: recipe.cook_minutes,
    recipeServings: recipe.servings,
    perServing: recipeAsMacroFood(recipe),
    ingredients: recipe.recipe_ingredients.map((i) => ({
      id: i.id,
      name: pickLocale(i.foods, locale),
      quantity: i.quantity,
      unit: i.unit,
      servingLabel: i.foods?.serving_label ?? null,
      note: i.note,
    })),
    steps: recipe.steps,
    videoUrl: recipe.video_url,
  };
}

/** Flattens a tree into exactly what the client screen renders — localized
 * names, "150g"-style amounts, precomputed totals — so the interactive
 * part (diet-days.tsx) gets small serializable props, not the raw tree.
 * Each plan day carries its own meals, notes, totals and targets. */
function toPlanView(
  tree: DietPlanTree,
  locale: AppLocale,
  imageUrls: Map<string, string>,
  servingsLabel: (count: number) => string
): PlanView {
  return {
    id: tree.id,
    name: pickLocale(tree, locale),
    notes: tree.notes_ar || tree.notes_en ? pickLocale(tree, locale, "notes") : null,
    days: tree.diet_plan_days.map((day) => {
      const dayMeals = tree.meals.filter((m) => m.diet_plan_day_id === day.id);
      return {
        id: day.id,
        name: pickLocale(day, locale),
        notes: day.notes_ar || day.notes_en ? pickLocale(day, locale, "notes") : null,
        // Only the four target fields -- not the tree, which would ship to the browser whole.
        targets: dayTargets(day, tree),
        totals: planMacros(dayMeals.map((m) => m.meal_items.map((i) => ({ quantity: i.quantity, food: itemMacroFood(i) })))),
        waterTargetMl: day.water_target_ml ?? DEFAULT_WATER_TARGET_ML,
        meals: toMealViews(dayMeals, locale, imageUrls, servingsLabel),
      };
    }),
  };
}

function toMealViews(
  mealRows: DietPlanTree["meals"],
  locale: AppLocale,
  imageUrls: Map<string, string>,
  servingsLabel: (count: number) => string
): PlanView["days"][number]["meals"] {
  return mealRows.map((meal) => {
    const items = meal.meal_items.map((item) => ({ quantity: item.quantity, food: itemMacroFood(item) }));
    return {
      id: meal.id,
      label: meal.label_ar || meal.label_en ? pickLocale(meal, locale, "label") : null,
      time: meal.time_of_day?.slice(0, 5) ?? null,
      totals: mealMacros(items),
      items: meal.meal_items.map((item) => ({
        id: item.id,
        name: pickLocale(item.foods ?? item.recipes, locale),
        amount: item.recipes ? servingsLabel(item.quantity) : formatServing(item.quantity, item.foods?.serving_label),
        kcal: Math.round(itemMacros(item.quantity, itemMacroFood(item)).kcal),
        recipe: item.recipes ? toRecipeView(item.recipes, locale, imageUrls) : null,
        quantity: item.quantity,
      })),
    };
  });
}

/** Each of the next 7 days resolves its own nutrition: the program day's
 * linked variant (day-plan.ts's dietPlanId, e.g. "Training day"), else the
 * client's standalone active plan; then, inside that plan, the plan day the
 * weekly schedule maps to that weekday (else its first training day, else
 * its first day). Only the handful of distinct plans get fetched, then the
 * client component switches days without a round trip. */
export default async function ClientDietPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("client.diet");
  const tRecipeItem = await getTranslations("recipes.item");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: clientRow } = await supabase.from("clients").select("id, coach_id").eq("profile_id", user!.id).single();
  if (!clientRow) {
    throw new Error("Client profile not found for authenticated user.");
  }

  const dietPlans = new DietPlansService(supabase);
  const nutrition = new NutritionLogsService(supabase);
  const serverToday = new Date().toISOString().slice(0, 10);
  const mealLogging = new MealLoggingService(supabase);
  const [programTree, standalone, logs, reminder, bodyProfile, todayCompletions, todayWater] = await Promise.all([
    new ProgramsService(supabase).getActiveTreeForClient(clientRow.id),
    dietPlans.getActiveTreeForClient(clientRow.id),
    // A day either side of the 7-day window: the device's date can differ from UTC's.
    nutrition.listLogs(clientRow.id, addDays(serverToday, -8), addDays(serverToday, 1)),
    nutrition.getReminderSettings(clientRow.id),
    nutrition.getBodyProfile(clientRow.id),
    mealLogging.listCompletions([clientRow.id], serverToday, serverToday),
    mealLogging.listWater([clientRow.id], serverToday, serverToday),
  ]);
  const todayLog: TodayLog = {
    meals: Object.fromEntries(
      todayCompletions.map((c) => [c.meal_id, { status: c.status as MealStatus, note: c.note }] as const)
    ),
    waterMl: todayWater.reduce((sum, w) => sum + w.amount_ml, 0),
  };

  // The strip (today onward) plus the days a log can still be edited for,
  // each resolved to its plan, then to its plan day.
  const plans = new Map<string, DietPlanTree>();
  if (standalone) plans.set(standalone.id, standalone);
  const resolveDate = (date: string) => {
    const plan = programTree ? resolveDayPlan(programTree, date) : null;
    return { date, kind: plan?.kind ?? null, planId: plan?.dietPlanId ?? standalone?.id ?? null };
  };
  const dateAt = (offset: number) => addDays(serverToday, offset);
  const resolved = Array.from({ length: programTree ? DAYS_AHEAD : 1 }, (_, i) => resolveDate(dateAt(i)));
  const loggable = Array.from({ length: LOG_WINDOW_DAYS + 2 }, (_, i) => resolveDate(dateAt(i - LOG_WINDOW_DAYS)));

  const missing = [...new Set([...resolved, ...loggable].map((d) => d.planId))].filter(
    (id): id is string => !!id && !plans.has(id)
  );
  for (const tree of await Promise.all(missing.map((id) => dietPlans.getTree(id)))) {
    if (tree) plans.set(tree.id, tree);
  }
  const dietDayId = (date: string, planId: string | null) => {
    const tree = planId ? plans.get(planId) : null;
    return tree ? (resolveDietDay(tree.diet_plan_days, tree.diet_plan_schedule, weekdayOf(date))?.id ?? null) : null;
  };
  // date -> plan day that date's menu comes from; what a log is stamped with.
  const logDayIds = Object.fromEntries(
    loggable.flatMap((d) => {
      const id = dietDayId(d.date, d.planId);
      return id ? [[d.date, id] as const] : [];
    })
  );

  const logPanel = (
    <NutritionLogPanel
      locale={locale}
      coachId={clientRow.coach_id}
      clientId={clientRow.id}
      serverToday={serverToday}
      dietDayIds={logDayIds}
      logs={logs.map((l) => ({
        log_date: l.log_date,
        kcal: l.kcal,
        protein_g: l.protein_g,
        carb_g: l.carb_g,
        fat_g: l.fat_g,
        off_plan: l.off_plan,
        off_plan_meal: l.off_plan_meal,
      }))}
      reminder={reminder && { enabled: reminder.enabled, remind_at: reminder.remind_at, timezone: reminder.timezone }}
      bodyProfile={bodyProfile}
      mealLabels={[
        ...new Set(
          [...plans.values()].flatMap((tree) =>
            tree.meals.filter((m) => m.label_ar || m.label_en).map((m) => pickLocale(m, locale, "label"))
          )
        ),
      ]}
    />
  );

  if (plans.size === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {logPanel}
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
    dietDayId: dietDayId(d.date, d.planId),
  }));
  // Recipe photos are in a private bucket; the client's storage policy only
  // signs ones from recipes in their own meal items.
  const imagePaths = [...plans.values()].flatMap((tree) =>
    tree.meals.flatMap((m) => m.meal_items.flatMap((i) => (i.recipes?.image_path ? [i.recipes.image_path] : [])))
  );
  const imageUrls = await new RecipesService(supabase).signImages(imagePaths).catch(() => new Map<string, string>());
  const servingsLabel = (count: number) => tRecipeItem("servings", { count });
  const planViews = Object.fromEntries(
    [...plans.values()].map((tree) => [tree.id, toPlanView(tree, locale, imageUrls, servingsLabel)])
  );

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      {logPanel}
      <DietDays locale={locale} days={days} plans={planViews} todayLog={todayLog} />
    </div>
  );
}
