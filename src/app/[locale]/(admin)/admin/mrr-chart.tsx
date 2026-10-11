import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { ChartColumn } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import type { MrrPoint } from "./types";

/** A chart needs something to compare; one month is just the KPI again. */
export const MIN_CHART_MONTHS = 2;

const thousands = (value: number, locale: AppLocale) =>
  formatNumber(value / 1000, locale, { maximumFractionDigits: 1 });

/** Bars only, no labels -- sits inside the mobile MRR card. Plain flex row,
 * so the oldest month is at the inline-start edge in both directions. */
export function MrrMiniBars({ points, currentMonth, label }: { points: MrrPoint[]; currentMonth: string; label: string }) {
  const max = Math.max(...points.map((p) => p.mrr_egp), 1);
  return (
    <div role="img" aria-label={label} className="flex h-14 items-end gap-1">
      {points.map((p) => (
        <span
          key={p.month}
          className={cn("flex-1 rounded-t-sm", p.month === currentMonth ? "bg-primary" : "bg-primary/40")}
          style={{ height: `${Math.round((p.mrr_egp / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** Monthly MRR from mrr_snapshots. History only exists from the day the
 * snapshot cron started, so with fewer than two months this says so instead
 * of drawing a chart. */
export async function MrrChart({
  points,
  currentMonth,
  locale,
}: {
  points: MrrPoint[];
  currentMonth: string;
  locale: AppLocale;
}) {
  const t = await getTranslations("admin.home.chart");

  if (points.length < MIN_CHART_MONTHS) {
    return (
      <section aria-labelledby="mrr-heading" className="flex min-w-0 flex-[2_1_480px] flex-col gap-3.5 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <h2 id="mrr-heading" className="text-xl leading-7 font-semibold">
          {t("title")}
        </h2>
        <EmptyState icon={ChartColumn} title={t("emptyTitle")} description={t("emptyBody")} className="my-auto" />
      </section>
    );
  }

  const values = points.map((p) => p.mrr_egp);
  const max = Math.max(...values, 1);

  return (
    <section aria-labelledby="mrr-heading" className="flex min-w-0 flex-[2_1_480px] flex-col gap-3.5 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="mrr-heading" className="text-xl leading-7 font-semibold">
          {t("title")}
        </h2>
        <span className="text-muted-foreground">{t("unit")}</span>
      </div>
      <div
        role="img"
        aria-label={t("aria", {
          count: points.length,
          min: thousands(Math.min(...values), locale),
          max: thousands(max, locale),
        })}
        className="flex h-50 items-end gap-2.5 border-b border-border"
      >
        {points.map((p) => (
          <div key={p.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
              {thousands(p.mrr_egp, locale)}
            </span>
            <div
              className={cn("w-full max-w-8.5 rounded-t-md", p.month === currentMonth ? "bg-primary" : "bg-primary/40")}
              style={{ height: `${Math.round((p.mrr_egp / max) * 88)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2.5" aria-hidden="true">
        {points.map((p) => (
          <span key={p.month} className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground">
            {formatDate(p.month, locale, { month: "short", timeZone: "UTC" })}
          </span>
        ))}
      </div>
    </section>
  );
}
