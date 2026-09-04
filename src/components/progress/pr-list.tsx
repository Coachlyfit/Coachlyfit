import { useTranslations } from "next-intl";
import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";

export type PrListRow = {
  exerciseId: string;
  exerciseName: { name_ar: string; name_en: string };
  maxWeight: { weight: number; reps: number } | null;
  estimatedOneRepMax: number | null;
};

/** Renders computePersonalRecords' output joined with exercise names.
 * Presentational only — the join and the actual PR math both happen
 * server-side (see the two callers: client detail's Strength section and
 * /c/progress), this just formats what it's handed. */
export function PrList({ rows, locale }: { rows: PrListRow[]; locale: AppLocale }) {
  const t = useTranslations("progress.prs");

  if (rows.length === 0) {
    return <EmptyState icon={Trophy} title={t("emptyTitle")} description={t("emptyDescription")} />;
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card">
      {rows.map((row) => (
        <div key={row.exerciseId} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
          <Trophy className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm">{pickLocale(row.exerciseName, locale)}</span>
          <div className="flex flex-col items-end gap-0.5">
            {row.maxWeight && (
              <span className="font-mono text-sm font-semibold tabular-nums">
                {formatNumber(row.maxWeight.weight, locale, { maximumFractionDigits: 1 })}kg × {row.maxWeight.reps}
              </span>
            )}
            {row.estimatedOneRepMax != null && (
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {t("estimated1rm", { value: formatNumber(row.estimatedOneRepMax, locale, { maximumFractionDigits: 1 }) })}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
