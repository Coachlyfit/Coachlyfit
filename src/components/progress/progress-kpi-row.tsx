import { getTranslations } from "next-intl/server";
import type { Database } from "@/lib/supabase/database.types";
import type { AppLocale } from "@/domain/locale";
import { adherenceAverage, lastCheckinDate, weightTrend } from "@/domain/progress/stats";
import { formatDate, formatNumber } from "@/lib/format";
import { StatCard } from "./stat-card";

type CheckinRow = Database["public"]["Tables"]["checkins"]["Row"];

/** Quick-scan KPI row: last check-in, streak, adherence %, weight trend.
 * Shared between the client hero context and the coach detail page so the
 * four numbers are computed identically in both places. */
export async function ProgressKpiRow({
  checkins,
  streak,
  locale,
}: {
  checkins: CheckinRow[];
  streak: number;
  locale: AppLocale;
}) {
  const t = await getTranslations("progress.stats");
  const last = lastCheckinDate(checkins);
  const adherence = adherenceAverage(checkins);
  const trend = weightTrend(checkins);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label={t("lastCheckin")} value={last ? formatDate(last, locale) : t("never")} />
      <StatCard
        label={t("streak")}
        value={streak > 0 ? t("days", { count: streak }) : t("noData")}
      />
      <StatCard
        label={t("adherence")}
        value={adherence != null ? `${formatNumber(adherence, locale)}%` : t("noData")}
      />
      <StatCard
        label={t("weightTrend")}
        value={trend ? `${formatNumber(Math.abs(trend.delta), locale, { maximumFractionDigits: 1 })} kg` : t("noData")}
        trend={trend ? (trend.delta < 0 ? "down" : trend.delta > 0 ? "up" : "flat") : undefined}
        trendTone={trend ? (trend.delta < 0 ? "good" : trend.delta > 0 ? "bad" : "neutral") : undefined}
      />
    </div>
  );
}
