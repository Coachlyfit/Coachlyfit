import { getTranslations } from "next-intl/server";
import { CheckCircle2, Circle, Flame, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { Trend } from "@/domain/progress/stats";

const TREND_ICON = { up: ArrowUp, down: ArrowDown, flat: Minus } as const;

/** The "obvious at a glance" state a client sees on opening the page — not
 * a muted line inside the form. Whether today is done, current weight and
 * its trend, streak, and adherence all live here. */
export async function CheckinHero({
  doneToday,
  trend,
  streak,
  adherence,
  locale,
}: {
  doneToday: boolean;
  trend: Trend | null;
  streak: number;
  adherence: number | null;
  locale: AppLocale;
}) {
  const t = await getTranslations("progress.hero");
  const tm = await getTranslations("measure");
  const TrendIcon = trend ? TREND_ICON[trend.delta < 0 ? "down" : trend.delta > 0 ? "up" : "flat"] : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          {doneToday ? (
            <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          ) : (
            <Circle className="size-5 text-muted-foreground" aria-hidden="true" />
          )}
          <p className={doneToday ? "text-sm font-medium text-success" : "text-sm font-medium text-muted-foreground"}>
            {doneToday ? t("doneToday") : t("notDoneToday")}
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("currentWeight")}</p>
            {trend ? (
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-semibold tabular-nums">
                  {tm("kg", { value: formatNumber(trend.latest, locale, { maximumFractionDigits: 1 }) })}
                </p>
                {trend.delta !== 0 && TrendIcon && (
                  <span
                    className={
                      "flex items-center gap-0.5 text-sm tabular-nums " +
                      (trend.delta < 0 ? "text-success" : "text-muted-foreground")
                    }
                  >
                    <TrendIcon className="size-3.5" aria-hidden="true" />
                    {tm("kg", { value: formatNumber(Math.abs(trend.delta), locale, { maximumFractionDigits: 1 }) })}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noWeight")}</p>
            )}
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1 text-sm font-medium tabular-nums">
              <Flame className={streak > 0 ? "size-4 text-warning-tint-foreground" : "size-4 text-muted-foreground"} aria-hidden="true" />
              {streak > 0 ? t("streak", { count: streak }) : null}
            </div>
            {streak === 0 && <p className="text-xs text-muted-foreground">{t("streakNone")}</p>}
          </div>
        </div>

        {adherence != null && (
          <Progress value={adherence} className="flex-col items-stretch gap-1.5">
            <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
              <span>{t("adherence")}</span>
              <span className="tabular-nums">{formatNumber(adherence, locale)}%</span>
            </div>
          </Progress>
        )}
      </CardContent>
    </Card>
  );
}
