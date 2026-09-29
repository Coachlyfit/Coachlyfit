import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { macroPercentages, type MacroTargets, type MacroTotals } from "@/domain/nutrition/macros";

const MACROS = [
  { key: "protein", field: "protein_g", target: "target_protein_g", color: "bg-chart-1" },
  { key: "carbs", field: "carb_g", target: "target_carb_g", color: "bg-chart-2" },
  { key: "fat", field: "fat_g", target: "target_fat_g", color: "bg-chart-3" },
] as const;

const OVER = 1.1;

function Bar({ ratio, color, over }: { ratio: number; color: string; over?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", over ? "bg-destructive" : color)}
        style={{ width: `${Math.min(Math.max(ratio, 0), 1) * 100}%` }}
      />
    </div>
  );
}

/** Day/plan totals: kcal against target plus one bar per macro. With a
 * target, a bar is progress toward it (red once >10% over); without one it
 * shows that macro's share of kcal, so the split still reads at a glance.
 * Shared by the coach builder, the client's plan, and the client profile
 * card — no "use client", so it renders on either side. */
export function MacroSummary({
  totals,
  targets,
  className,
}: {
  totals: MacroTotals;
  targets?: MacroTargets | null;
  className?: string;
}) {
  const t = useTranslations("diets.macros");
  const pct = macroPercentages(totals);
  const shares = { protein: pct.proteinPercent, carbs: pct.carbPercent, fat: pct.fatPercent };
  const kcalTarget = targets?.target_kcal ?? null;
  const kcalOver = kcalTarget != null && totals.kcal > kcalTarget * OVER;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className={cn("font-mono text-3xl font-semibold tabular-nums", kcalOver && "text-destructive")}>
            {Math.round(totals.kcal)}
          </span>
          {kcalTarget != null && (
            <span className="font-mono text-sm text-muted-foreground tabular-nums">/ {kcalTarget}</span>
          )}
          <span className="text-sm text-muted-foreground">{t("kcal")}</span>
        </div>
        {kcalTarget != null && <Bar ratio={totals.kcal / kcalTarget} color="bg-primary" over={kcalOver} />}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {MACROS.map(({ key, field, target, color }) => {
          const actual = totals[field];
          const goal = targets?.[target] ?? null;
          const over = goal != null && goal > 0 && actual > goal * OVER;
          return (
            <div key={key} className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("size-2 shrink-0 rounded-full", color)} aria-hidden="true" />
                <span className="truncate">{t(key)}</span>
                {goal == null && <span className="font-mono tabular-nums">{shares[key]}%</span>}
              </span>
              <span className="font-mono text-sm tabular-nums">
                <span className={cn("font-semibold", over && "text-destructive")}>{Math.round(actual)}</span>
                {goal != null && <span className="text-muted-foreground">/{Math.round(goal)}</span>}
                <span className="text-muted-foreground">g</span>
              </span>
              <Bar ratio={goal ? actual / goal : shares[key] / 100} color={color} over={over} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One-line totals for a single meal: "520 kcal · P 40 · C 60 · F 12". */
export function MacroLine({ totals, className }: { totals: MacroTotals; className?: string }) {
  const t = useTranslations("diets.macros");
  return (
    <span className={cn("font-mono text-xs text-muted-foreground tabular-nums", className)}>
      <span className="font-semibold text-foreground">{Math.round(totals.kcal)}</span> {t("kcal")} · {t("p")}{" "}
      {Math.round(totals.protein_g)} · {t("c")} {Math.round(totals.carb_g)} · {t("f")} {Math.round(totals.fat_g)}
    </span>
  );
}
