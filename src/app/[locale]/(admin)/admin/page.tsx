import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { coachNote, coachStage, needsAttention } from "@/domain/billing/coach-stage";
import type { AppLocale } from "@/domain/locale";
import { CoachesSection } from "./coaches-section";
import { KpiCards } from "./kpi-cards";
import { MIN_CHART_MONTHS, MrrChart } from "./mrr-chart";
import { PeriodSelect } from "./period-select";
import { PlanMix } from "./plan-mix";
import {
  COACH_VIEWS,
  PERIODS,
  type AdminMetrics,
  type CoachView,
  type CoachesViewMode,
  type Period,
} from "./types";

/** Admin home. Two RPCs, both admin-checked in the database
 * (private.is_admin()): admin_metrics() for everything aggregate and
 * admin_list_coaches() for the rows -- no per-coach queries. The layout's
 * role redirect is the UX guard; the RPCs are the authorization boundary. */
export default async function AdminHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ view?: string; period?: string }>;
}) {
  const { locale } = await params;
  const { view: rawView, period: rawPeriod } = await searchParams;
  const t = await getTranslations("admin");
  const supabase = await createClient();

  // Unknown values from a hand-edited URL fall back to the defaults.
  const view: CoachesViewMode = COACH_VIEWS.includes(rawView as CoachesViewMode) ? (rawView as CoachesViewMode) : "list";
  const period: Period = PERIODS.includes(Number(rawPeriod) as Period) ? (Number(rawPeriod) as Period) : 12;

  const [{ data: metricsData }, { data: rows }] = await Promise.all([
    supabase.rpc("admin_metrics"),
    supabase.rpc("admin_list_coaches"),
  ]);
  const metrics = metricsData as AdminMetrics | null;

  const now = new Date();
  // Same key format as mrr_snapshots.month (first of the month, UTC date).
  const currentMonth = `${now.toISOString().slice(0, 7)}-01`;
  const history = metrics?.mrr_history ?? [];

  const coaches: CoachView[] = (rows ?? []).map((row) => {
    const stage = coachStage(row.status);
    return {
      id: row.coach_id,
      name: row.business_name,
      owner: row.owner_name,
      phone: row.phone,
      tier: row.tier_key,
      amount: !row.is_complimentary && (stage === "active" || stage === "pastDue") ? row.price_egp_monthly : null,
      complimentary: row.is_complimentary,
      clients: row.client_count,
      periodEnd: stage === "trial" ? (row.trial_ends_at ?? row.current_period_end) : row.current_period_end,
      stage,
      note: coachNote(row, now),
      attention: needsAttention(row, now),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl leading-9 font-semibold">{t("title")}</h1>
          <p className="text-base text-muted-foreground">{t("home.subtitle")}</p>
        </div>
        {history.length >= MIN_CHART_MONTHS && <PeriodSelect value={period} />}
      </header>

      {metrics && (
        <>
          <KpiCards metrics={metrics} history={history} currentMonth={currentMonth} locale={locale} />
          <div className="flex flex-wrap items-stretch gap-5">
            <MrrChart points={history.slice(-period)} currentMonth={currentMonth} locale={locale} />
            <PlanMix metrics={metrics} locale={locale} />
          </div>
        </>
      )}

      <CoachesSection locale={locale} coaches={coaches} view={view} />
    </div>
  );
}
