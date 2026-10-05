import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { DietPlansService, type DietPlanScope } from "@/domain/nutrition/diet-plans.service";
import { STATUS_ORDER, planProgress, planStatus } from "@/domain/nutrition/plan-status";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import { PageTitle } from "@/components/dashboard/page-title";
import { CreateDietPlanDialog } from "./create-diet-plan-dialog";
import { DietsTrashButton } from "./diets-trash-button";
import { DietsView, type ClientPlanCard, type TemplateCard } from "./diets-view";

export default async function DietsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ scope?: string; client?: string }>;
}) {
  const { locale } = await params;
  const { scope: rawScope, client: defaultClientId } = await searchParams;
  const scope: DietPlanScope = rawScope === "templates" ? "templates" : rawScope === "assigned" ? "assigned" : "all";
  const t = await getTranslations("diets");
  const supabase = await createClient();

  const [{ data: clients }, plans] = await Promise.all([
    supabase.from("clients").select("id, display_name").neq("status", "archived"),
    new DietPlansService(supabase).listOverview(),
  ]);

  // Same UTC "today" as DietPlansService.cloneToClient's start_date.
  const today = new Date().toISOString().slice(0, 10);
  const clientPlans: ClientPlanCard[] = [];
  const templates: TemplateCard[] = [];
  for (const plan of plans) {
    const clientName = plan.clients?.display_name ?? null;
    const base = {
      id: plan.id,
      name: pickLocale(plan, locale),
      searchText: `${plan.name_ar} ${plan.name_en} ${clientName ?? ""}`.toLowerCase(),
      // The coach's own target when set, else what the meals add up to.
      kcal: plan.target_kcal ?? (plan.plannedKcal > 0 ? plan.plannedKcal : null),
      meals: plan.mealCount,
    };
    // A former client's row is unreadable after a coach switch, so a null
    // join only means "template" when client_id is null too.
    if (!plan.client_id) {
      templates.push(base);
      continue;
    }
    clientPlans.push({
      ...base,
      clientId: plan.client_id,
      clientName,
      startDate: plan.start_date,
      endDate: plan.end_date,
      status: planStatus(plan.start_date, plan.end_date, today),
      progress: planProgress(plan.start_date, plan.end_date, today),
    });
  }
  // Stable, so newest-first survives within each status.
  clientPlans.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));

  const endingSoon = clientPlans.filter((p) => p.status === "endingSoon").length;
  const running = endingSoon + clientPlans.filter((p) => p.status === "active").length;
  const num = (chunks: React.ReactNode) => (
    <span className="font-mono font-semibold text-foreground tabular-nums">{chunks}</span>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("title")} />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl leading-9 font-semibold">{t("title")}</h1>
          {clientPlans.length > 0 && (
            <p className="text-base text-muted-foreground">
              {t.rich("summaryActive", { count: running, value: formatNumber(running, locale), num })}
              {" · "}
              {t.rich("summaryEnding", { count: endingSoon, value: formatNumber(endingSoon, locale), num })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DietsTrashButton locale={locale} />
          <CreateDietPlanDialog
            locale={locale}
            clients={clients ?? []}
            defaultClientId={defaultClientId}
            defaultOpen={!!defaultClientId}
          />
        </div>
      </header>

      <DietsView
        locale={locale}
        scope={scope}
        clientPlans={clientPlans}
        templates={templates}
        clients={clients ?? []}
      />
    </div>
  );
}
