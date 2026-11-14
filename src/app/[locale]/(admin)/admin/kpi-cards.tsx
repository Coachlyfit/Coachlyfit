import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/status-badge";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { MIN_CHART_MONTHS, MrrMiniBars } from "./mrr-chart";
import type { AdminMetrics, MrrPoint } from "./types";

const CARD = "flex flex-col gap-1 rounded-xl bg-card p-4.5 ring-1 ring-foreground/10";
const FIGURE = "font-mono text-2xl leading-8 font-semibold tabular-nums";
const TILE = "flex flex-col rounded-xl p-3 leading-snug";
const TILE_FIGURE = "font-mono text-[1.375rem] font-semibold tabular-nums";

const num = (chunks: React.ReactNode) => <span className="font-mono tabular-nums">{chunks}</span>;

/** Every figure comes from admin_metrics(); the only arithmetic here is the
 * churn ratio and the month-over-month difference. */
export async function KpiCards({
  metrics,
  history,
  currentMonth,
  locale,
}: {
  metrics: AdminMetrics;
  history: MrrPoint[];
  currentMonth: string;
  locale: AppLocale;
}) {
  const t = await getTranslations("admin.home");

  // Last month's closing snapshot; absent until the cron has run in two
  // different months, in which case the delta badge is simply not shown.
  const previous = history.filter((p) => p.month < currentMonth).at(-1);
  const delta = previous ? metrics.mrr_egp - previous.mrr_egp : null;

  // 90-day churn needs 90 days of stamped status changes. Until then show
  // the all-time ratio and label it as that.
  const windowed = metrics.churn_window_complete;
  const canceled = windowed ? metrics.canceled_90d_count : metrics.canceled_count;
  const churnBase = metrics.active_count + metrics.past_due_count + canceled;
  const churnPct = formatNumber(churnBase > 0 ? (canceled / churnBase) * 100 : 0, locale, { maximumFractionDigits: 1 });

  const unit = <span className="text-sm font-medium">{t("currency")}</span>;
  const mrr = formatNumber(metrics.mrr_egp, locale);
  const deltaBadge = delta != null && (
    <StatusBadge tone={delta >= 0 ? "success" : "destructive"} className="self-start">
      {t("mrrDelta", { amount: formatNumber(delta, locale, { signDisplay: "always" }) })}
    </StatusBadge>
  );
  const churnOf = t.rich("churnOf", {
    canceled: formatNumber(canceled, locale),
    total: formatNumber(churnBase, locale),
    num,
  });
  const pastDueAmount = t.rich("pastDueAmount", { amount: formatNumber(metrics.past_due_amount_egp, locale), num });

  return (
    <section aria-label={t("kpiLabel")}>
      <div className="hidden grid-cols-2 gap-4 md:grid xl:grid-cols-4">
        <div className={CARD}>
          <span className="text-muted-foreground">{t("mrr")}</span>
          <span className={FIGURE}>
            {mrr} {unit}
          </span>
          {deltaBadge}
        </div>
        <div className={CARD}>
          <span className="text-muted-foreground">{t("activeCoaches")}</span>
          <span className={FIGURE}>{formatNumber(metrics.active_count, locale)}</span>
          <span className="text-muted-foreground">
            {t.rich("trialsNote", { count: formatNumber(metrics.trialing_count, locale), num })}
          </span>
          {metrics.complimentary_count > 0 && (
            <span className="text-muted-foreground">
              {t.rich("complimentaryNote", { count: formatNumber(metrics.complimentary_count, locale), num })}
            </span>
          )}
        </div>
        <div className={CARD}>
          <span className="text-muted-foreground">{t("pastDue")}</span>
          <span className={`${FIGURE} ${metrics.past_due_count > 0 ? "text-destructive-tint-foreground" : ""}`}>
            {formatNumber(metrics.past_due_count, locale)}
          </span>
          <span className="text-muted-foreground">{pastDueAmount}</span>
        </div>
        <div className={CARD}>
          <span className="text-muted-foreground">{windowed ? t("churn90") : t("churnAll")}</span>
          <span className={FIGURE}>{churnPct}%</span>
          <span className="text-muted-foreground">{churnOf}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 md:hidden">
        <div className={`${CARD} gap-2 p-4`}>
          <span className="text-muted-foreground">{t("mrr")}</span>
          <span className="font-mono text-3xl leading-9 font-semibold tabular-nums">
            {mrr} {unit}
          </span>
          {history.length >= MIN_CHART_MONTHS && (
            <MrrMiniBars points={history} currentMonth={currentMonth} label={t("chart.miniAria", { count: history.length })} />
          )}
          {deltaBadge}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className={`${TILE} bg-card ring-1 ring-foreground/10`}>
            <span className="text-muted-foreground">{t("activeShort")}</span>
            <span className={TILE_FIGURE}>{formatNumber(metrics.active_count, locale)}</span>
            <span className="text-xs text-muted-foreground">
              {t.rich("trialsShort", { count: formatNumber(metrics.trialing_count, locale), num })}
            </span>
            {metrics.complimentary_count > 0 && (
              <span className="text-xs text-muted-foreground">
                {t.rich("complimentaryShort", { count: formatNumber(metrics.complimentary_count, locale), num })}
              </span>
            )}
          </div>
          <div className={`${TILE} bg-destructive-tint text-destructive-tint-foreground`}>
            <span>{t("pastDue")}</span>
            <span className={TILE_FIGURE}>{formatNumber(metrics.past_due_count, locale)}</span>
            <span className="text-xs">{pastDueAmount}</span>
          </div>
          <div className={`${TILE} bg-card ring-1 ring-foreground/10`}>
            <span className="text-muted-foreground">{windowed ? t("churn90Short") : t("churnAllShort")}</span>
            <span className={TILE_FIGURE}>{churnPct}%</span>
            <span className="text-xs text-muted-foreground">{churnOf}</span>
          </div>
          <Link href="/admin/online" className={`${TILE} bg-card ring-1 ring-foreground/10`}>
            <span className="text-muted-foreground">{t("online")}</span>
            <span className={TILE_FIGURE}>{formatNumber(metrics.online_count, locale)}</span>
            <span className="text-xs text-muted-foreground">{t("onlineNote")}</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
