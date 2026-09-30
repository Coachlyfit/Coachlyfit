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
import { MacroSummary } from "@/components/nutrition/macro-summary";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";
import { NutritionLogsService } from "@/domain/nutrition/nutrition-logs.service";
import { Badge } from "@/components/ui/badge";
import { getActiveDiet } from "./data";
import { AssignPlanDialog } from "./assign-plan-dialog";
import { SuggestTargetsDialog } from "./suggest-targets-dialog";

export async function NutritionCard({ clientId, locale }: { clientId: string; locale: AppLocale }) {
  const t = await getTranslations("clients.profile.nutrition");
  const tNutrition = await getTranslations("nutrition");
  const supabase = await createClient();
  const [diet, suggestion] = await Promise.all([
    getActiveDiet(clientId),
    new NutritionLogsService(supabase).suggestionFor(clientId, new Date()),
  ]);
  const suggestDialog = (
    <SuggestTargetsDialog
      locale={locale}
      clientId={clientId}
      dietPlanId={diet?.id ?? null}
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
                <Button variant="outline" size="sm" render={<Link href={`/diets?client=${clientId}`} />}>
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
  const totals = planMacros(diet.meals.map((m) => m.meal_items.map((i) => ({ quantity: i.quantity, food: i.foods }))));

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
        <MacroSummary totals={totals} targets={diet} />
        {diet.targets_source && (
          <Badge variant="outline" className="self-start">
            {tNutrition(`suggest.source.${diet.targets_source as "manual" | "suggested" | "suggested_edited"}`)}
          </Badge>
        )}

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
          {suggestDialog}
        </div>
      </CardContent>
    </Card>
  );
}
