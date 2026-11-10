import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressLineChart } from "@/components/charts/progress-line-chart";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { num } from "./num";

const MAX_POINTS = 60;

/** Weight trend. There is no goal-weight field anywhere in the schema, so
 * no goal line or goal label — just start, today and the change between. */
export async function WeightCard({
  locale,
  points,
}: {
  locale: AppLocale;
  /** Oldest first; only check-ins that recorded a weight. */
  points: { date: string; value: number }[];
}) {
  const t = await getTranslations("client.overview");
  const logButton = (
    <Link href="/c/checkin" className={cn(buttonVariants({ variant: "secondary" }), "w-full")}>
      {t("logWeight")}
    </Link>
  );

  if (points.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState title={t("noWeight")} description={t("noWeightBody")} action={logButton} className="py-4" />
        </CardContent>
      </Card>
    );
  }

  const first = points[0].value;
  const current = points[points.length - 1].value;
  const delta = points.length > 1 ? current - first : null;
  const fmt = (v: number) => formatNumber(v, locale, { maximumFractionDigits: 1 });
  const fmtDelta = (v: number) => formatNumber(v, locale, { maximumFractionDigits: 1, signDisplay: "exceptZero" });

  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col leading-tight">
            <h2 className="text-sm font-medium text-muted-foreground">{t("weight")}</h2>
            <span className="font-mono text-3xl font-semibold tabular-nums">
              {fmt(current)} <span className="text-sm font-medium">{t("kg")}</span>
            </span>
          </div>
          {delta == null ? (
            <Badge variant="info">{t("firstWeighIn")}</Badge>
          ) : (
            <Badge variant={delta <= 0 ? "success" : "info"}>
              {t.rich("changeSinceStart", { delta: fmtDelta(delta), num })}
            </Badge>
          )}
        </div>

        {points.length > 1 && (
          <>
            <div role="img" aria-label={`${t("chartLabel")}: ${fmt(first)} → ${fmt(current)} ${t("kg")}`}>
              <ProgressLineChart
                compact
                data={points.slice(-MAX_POINTS)}
                label={t("weight")}
                color="var(--primary)"
                unit={t("kg")}
              />
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t.rich("startLabel", { weight: fmt(first), num })}</span>
              <span>{t("todayLabel")}</span>
            </div>
          </>
        )}
        {logButton}
      </CardContent>
    </Card>
  );
}
