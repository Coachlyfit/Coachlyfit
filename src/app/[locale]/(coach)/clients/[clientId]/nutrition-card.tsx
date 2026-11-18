import { getTranslations } from "next-intl/server";
import { Apple, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { planMacros } from "@/domain/nutrition/macros";
import { dayTargets, type DietDayKind } from "@/domain/nutrition/diet-days";
import { MacroSummary } from "@/components/nutrition/macro-summary";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";
import { NutritionLogsService } from "@/domain/nutrition/nutrition-logs.service";
import { Badge } from "@/components/ui/badge";
import { getActiveDiet } from "./data";
import { AssignPlanDialog } from "./assign-plan-dialog";
import { SuggestTargetsDialog } from "./suggest-targets-dialog";
import { itemMacroFood } from "@/domain/recipes/recipe-nutrition";

export async function NutritionCard({ clientId, locale }: { clientId: string; locale: AppLocale }) {
  const t = await getTranslations("clients.profile.nutrition");
  const tNutrition = await getTranslations("nutrition");
  const supabase = await createClient();
  const diet = await getActiveDiet(clientId);
  // The card summarises the plan's first day (the whole plan for a
  // single-day plan); the suggestion is for that same day's kind.
  const day = diet?.diet_plan_days[0] ?? null;
  const suggestion = await new NutritionLogsService(supabase).suggestionFor(
    clientId,
    new Date(),
    day?.kind as DietDayKind | undefined
  );
  const suggestDialog = (
    <SuggestTargetsDialog
      locale={locale}
      clientId={clientId}
      dietPlanId={diet?.id ?? null}
      dayId={day?.id}
      profile={suggestion.profile}
      weight={suggestion.weight}
      result={suggestion.result}
    />
  );

  if (!diet) {
    const templates = await new DietPlansService(supabase).list("templates");
    return (
      <Card>
        <CardContent className="py-2">
          <EmptyState
            icon={Apple}
            title={t("empty")}
            description={t("emptyDescription")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <AssignPlanDialog
                  kind="diet"
                  locale={locale}
                  clientId={clientId}
                  templates={templates.map((p) => ({ id: p.id, name: pickLocale(p, locale) }))}
                  replaceActive={false}
                  trigger={t("assign")}
                />
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/diets?client=${clientId}`} />}>
                  {t("create")}
                </Button>
                {suggestDialog}
              </div>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const templates = await new DietPlansService(supabase).list("templates");
  const meals = diet.meals.filter((m) => m.diet_plan_day_id === day?.id);
  const totals = planMacros(meals.map((m) => m.meal_items.map((i) => ({ quantity: i.quantity, food: itemMacroFood(i) }))));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <CardTitle className="truncate text-base">{pickLocale(diet, locale)}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {diet.end_date
              ? t("dateRange", { start: formatDate(diet.start_date, locale), end: formatDate(diet.end_date, locale) })
              : t("startedOn", { date: formatDate(diet.start_date, locale) })}
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <MacroSummary totals={totals} targets={dayTargets(day, diet)} />
        {diet.targets_source && (
          <Badge variant="outline" className="self-start">
            {tNutrition(`suggest.source.${diet.targets_source as "manual" | "suggested" | "suggested_edited"}`)}
          </Badge>
        )}

        <p className="text-xs text-muted-foreground">{t("mealCount", { count: meals.length })}</p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" nativeButton={false} render={<Link href={`/diets/${diet.id}`} />}>
            <ExternalLink className="size-4" />
            {t("open")}
          </Button>
          <AssignPlanDialog
            kind="diet"
            locale={locale}
            clientId={clientId}
            templates={templates.map((p) => ({ id: p.id, name: pickLocale(p, locale) }))}
            replaceActive
            trigger={t("replace")}
            variant="outline"
          />
          {suggestDialog}
        </div>
      </CardContent>
    </Card>
  );
}
