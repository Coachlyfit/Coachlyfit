import { getTranslations } from "next-intl/server";
import { Apple, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate, formatNumber } from "@/lib/format";
import { planMacros, macroPercentages } from "@/domain/nutrition/macros";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";
import { getActiveDiet } from "./data";
import { AssignPlanDialog } from "./assign-plan-dialog";

export async function NutritionCard({ clientId, locale }: { clientId: string; locale: AppLocale }) {
  const t = await getTranslations("clients.profile.nutrition");
  const supabase = await createClient();
  const diet = await getActiveDiet(clientId);

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
                <Button variant="outline" size="sm" render={<Link href={`/diets?client=${clientId}`} />}>
                  {t("create")}
                </Button>
              </div>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const templates = await new DietPlansService(supabase).list("templates");
  const totals = planMacros(diet.meals.map((m) => m.meal_items.map((i) => ({ quantity: i.quantity, food: i.foods }))));
  const percentages = macroPercentages(totals);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">{pickLocale(diet, locale)}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {diet.end_date
              ? t("dateRange", { start: formatDate(diet.start_date, locale), end: formatDate(diet.end_date, locale) })
              : t("startedOn", { date: formatDate(diet.start_date, locale) })}
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{formatNumber(Math.round(totals.kcal), locale)}</span>
          <span className="text-sm text-muted-foreground">{t("kcal")}</span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="flex h-full w-full">
            <div className="h-full bg-chart-1" style={{ width: `${percentages.proteinPercent}%` }} />
            <div className="h-full bg-chart-2" style={{ width: `${percentages.carbPercent}%` }} />
            <div className="h-full bg-chart-3" style={{ width: `${percentages.fatPercent}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-chart-1" />
            {t("protein", { grams: Math.round(totals.protein_g) })}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-chart-2" />
            {t("carbs", { grams: Math.round(totals.carb_g) })}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-chart-3" />
            {t("fat", { grams: Math.round(totals.fat_g) })}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">{t("mealCount", { count: diet.meals.length })}</p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" render={<Link href={`/diets/${diet.id}`} />}>
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
        </div>
      </CardContent>
    </Card>
  );
}
