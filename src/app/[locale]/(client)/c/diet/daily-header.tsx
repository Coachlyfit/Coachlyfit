"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { MacroTargets, MacroTotals } from "@/domain/nutrition/macros";

const MACROS = [
  { key: "protein", field: "protein_g", target: "target_protein_g", bar: "bg-nutri-orange" },
  { key: "carbs", field: "carb_g", target: "target_carb_g", bar: "bg-nutri-blue" },
  { key: "fat", field: "fat_g", target: "target_fat_g", bar: "bg-nutri-purple" },
] as const;

/** Sticky top bar of the nutrition page: the day, kcal against target in a
 * pill, and one bar per macro. `totals` is what's been eaten for today (it
 * moves as meals are marked done) and the planned amounts for any other day. */
export function DailyHeader({
  locale,
  dateLabel,
  isToday,
  totals,
  targets,
}: {
  locale: AppLocale;
  dateLabel: string;
  isToday: boolean;
  totals: MacroTotals;
  targets: MacroTargets;
}) {
  const t = useTranslations("diets.macros");
  const tLog = useTranslations("client.diet.log");
  const kcalTarget = targets.target_kcal;

  return (
    <div className="sticky top-0 z-30 -mx-4 flex flex-col gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{isToday ? tLog("dailyPlan") : tLog("plannedDay")}</p>
          <p className="truncate text-base font-semibold">{dateLabel}</p>
        </div>
        <div className="shrink-0 rounded-full border border-nutri-orange/25 bg-nutri-orange/15 px-4 py-1.5 text-center">
          <p className="font-mono text-xl font-medium tabular-nums text-nutri-orange">
            {formatNumber(Math.round(totals.kcal), locale)}
            {kcalTarget != null && (
              <span className="text-sm text-muted-foreground"> / {formatNumber(kcalTarget, locale)}</span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">{t("kcal")}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {MACROS.map(({ key, field, target, bar }) => {
          const goal = targets[target];
          const pct = goal ? Math.min(100, (totals[field] / goal) * 100) : 0;
          return (
            <div key={key} className="flex min-w-0 flex-col gap-1.5 rounded-[10px] bg-muted/60 px-3 py-2.5">
              <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                <span className="truncate">{t(key)}</span>
                <span className="font-mono text-xs font-medium tabular-nums text-foreground">
                  {tLog("grams", { n: formatNumber(Math.round(totals[field]), locale) })}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
                <div className={cn("h-full rounded-full transition-[width] duration-700", bar)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
