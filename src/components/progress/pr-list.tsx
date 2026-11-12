import { useTranslations } from "next-intl";
import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { PrRow } from "@/domain/progress/pr-rows";
import { mmss, trimNumber } from "@/domain/workouts/session-runner";
import { formatNumber } from "@/lib/format";

export type PrListRow = PrRow;

/** Renders buildPrRows' output. Presentational only — the join and the actual
 * PR math both happen server-side (see the two callers: client detail's
 * Strength section and /c/progress), this just formats what it's handed.
 * Each exercise shows the bests that fit how it's measured: weight × reps, a
 * longest hold, a best pace, a farthest distance. */
export function PrList({ rows, locale }: { rows: PrListRow[]; locale: AppLocale }) {
  const t = useTranslations("progress.prs");
  const tm = useTranslations("measure");

  if (rows.length === 0) {
    return <EmptyState icon={Trophy} title={t("emptyTitle")} description={t("emptyDescription")} />;
  }

  const duration = (seconds: number) =>
    seconds >= 120 ? tm("minutes", { value: trimNumber(seconds / 60) }) : tm("seconds", { value: Math.round(seconds) });
  const distance = (meters: number) =>
    meters >= 1000 ? tm("km", { value: trimNumber(meters / 1000) }) : tm("meters", { value: trimNumber(meters) });

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card">
      {rows.map((row) => {
        const lines: { key: string; text: string; muted?: boolean }[] = [];
        if (row.maxWeight) {
          lines.push({
            key: "weight",
            text: `${formatNumber(row.maxWeight.weight, locale, { maximumFractionDigits: 1 })}kg × ${row.maxWeight.reps}`,
          });
        }
        if (row.maxReps != null) lines.push({ key: "reps", text: t("maxReps", { value: row.maxReps }) });
        if (row.maxDuration != null) lines.push({ key: "duration", text: t("longest", { value: duration(row.maxDuration) }) });
        if (row.maxDistance != null) lines.push({ key: "distance", text: t("farthest", { value: distance(row.maxDistance) }) });
        if (row.bestPace != null) lines.push({ key: "pace", text: t("bestPace", { value: mmss(row.bestPace) }) });
        if (row.maxCalories != null) lines.push({ key: "kcal", text: t("maxCalories", { value: row.maxCalories }) });
        if (row.estimatedOneRepMax != null) {
          lines.push({
            key: "1rm",
            text: t("estimated1rm", { value: formatNumber(row.estimatedOneRepMax, locale, { maximumFractionDigits: 1 }) }),
            muted: true,
          });
        }

        return (
          <div key={row.exerciseId} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
            <Trophy className="size-4 shrink-0 text-warning" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm">{pickLocale(row.exerciseName, locale)}</span>
            <div className="flex flex-col items-end gap-0.5">
              {lines.map((line) => (
                <span
                  key={line.key}
                  className={
                    line.muted
                      ? "font-mono text-[11px] text-muted-foreground tabular-nums"
                      : "font-mono text-sm font-semibold tabular-nums"
                  }
                >
                  {line.text}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
