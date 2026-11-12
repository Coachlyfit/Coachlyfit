"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { mmss } from "@/domain/workouts/session-runner";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { SyncStatusBar } from "@/components/offline/sync-status-bar";
import type { SessionTotals } from "@/domain/workouts/summary";

export type SummaryRow = { id: string; name: string; done: number; total: number; topWeight: number | null };

export function SessionSummary({
  locale,
  dayLabel,
  elapsedSeconds,
  setsDone,
  setsTotal,
  totalVolume,
  totals,
  rows,
  onEditSets,
}: {
  locale: AppLocale;
  dayLabel: string;
  elapsedSeconds: number;
  setsDone: number;
  setsTotal: number;
  totalVolume: number;
  /** Time-under-effort / distance / calories across the logged sets. */
  totals: SessionTotals;
  rows: SummaryRow[];
  onEditSets: () => void;
}) {
  const t = useTranslations("client.workout.summary");
  const tm = useTranslations("measure");

  // Volume only when something was lifted; a run or a plank session reports
  // what it did instead of "0 kg".
  const stats = [
    { label: t("duration"), value: mmss(elapsedSeconds) },
    { label: t("sets"), value: `${setsDone}/${setsTotal}` },
    ...(totalVolume > 0 || (totals.totalDistanceM === 0 && totals.totalDurationSeconds === 0 && totals.totalCalories === 0)
      ? [{ label: t("volumeKg"), value: formatNumber(Math.round(totalVolume), locale) }]
      : []),
    ...(totals.totalDistanceM > 0
      ? [
          {
            label: tm("summary.distance"),
            value:
              totals.totalDistanceM >= 1000
                ? tm("km", { value: formatNumber(totals.totalDistanceM / 1000, locale, { maximumFractionDigits: 2 }) })
                : tm("meters", { value: formatNumber(totals.totalDistanceM, locale, { maximumFractionDigits: 0 }) }),
          },
        ]
      : []),
    ...(totals.totalDurationSeconds > 0
      ? [{ label: tm("summary.timeUnderEffort"), value: mmss(totals.totalDurationSeconds) }]
      : []),
    ...(totals.totalCalories > 0
      ? [{ label: tm("summary.calories"), value: tm("kcal", { value: formatNumber(totals.totalCalories, locale) }) }]
      : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <SyncStatusBar />
      <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-4">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-success-tint text-success-tint-foreground">
            <Check className="size-8" strokeWidth={2.5} aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold">{t("title", { day: dayLabel })}</h1>
          <p className="text-base text-muted-foreground">{t("body")}</p>
        </div>

        <dl className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="flex min-w-0 flex-col gap-0.5 rounded-2xl border border-border bg-card px-2.5 py-3">
              <dt className="truncate text-sm text-muted-foreground">{s.label}</dt>
              <dd className="truncate font-mono text-xl font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>

        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-3.5 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">{row.name}</span>
                <span className="truncate font-mono text-sm text-muted-foreground tabular-nums">
                  {t("setsLine", { done: row.done, total: row.total })}
                  {row.topWeight != null && ` · ${t("top", { weight: row.topWeight })}`}
                </span>
              </div>
              {row.done >= row.total ? (
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground"
                  aria-label={t("complete")}
                >
                  <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                </span>
              ) : (
                <span className="shrink-0 rounded-md bg-warning-tint px-2 py-0.5 text-xs font-medium text-warning-tint-foreground">
                  {t("incomplete")}
                </span>
              )}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onEditSets}
          className="h-11 self-center px-4 text-sm font-medium text-muted-foreground"
        >
          {t("editSets")}
        </button>
      </main>
      <div className="shrink-0 border-t border-border bg-card px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Link
          href="/c"
          className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-[17px] font-semibold text-primary-foreground"
        >
          {t("backToProgram")}
        </Link>
      </div>
    </div>
  );
}
