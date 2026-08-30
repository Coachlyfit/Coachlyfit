import { getTranslations } from "next-intl/server";
import { Ruler } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressLineChart } from "@/components/charts/progress-line-chart";
import { metricPresetI18nKey } from "@/domain/progress/metric-presets";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { Database } from "@/lib/supabase/database.types";

type BodyMetricRow = Database["public"]["Tables"]["body_metrics"]["Row"];
type CustomMetric = { key: string; label_ar: string; label_en: string };

/** One Card + chart per body metric, replacing the identical loop that was
 * duplicated between the client and coach pages. */
export async function MetricCharts({
  grouped,
  customMetrics = [],
  locale,
}: {
  grouped: Map<string, BodyMetricRow[]>;
  customMetrics?: CustomMetric[];
  locale: AppLocale;
}) {
  const t = await getTranslations("progress.metrics");
  const customLabelByKey = Object.fromEntries(customMetrics.map((m) => [m.key, pickLocale(m, locale, "label")]));

  if (grouped.size === 0) {
    return (
      <EmptyState
        icon={Ruler}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {[...grouped.entries()].map(([metric, rows]) => {
        const presetKey = metricPresetI18nKey(metric);
        const label = presetKey ? t(presetKey) : (customLabelByKey[metric] ?? metric.replace(/_/g, " "));
        return (
          <Card key={metric}>
            <CardHeader>
              <CardTitle className="text-base capitalize">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressLineChart
                data={rows.map((r) => ({ date: r.taken_on, value: r.value }))}
                label={label}
                color="var(--chart-5)"
                unit={rows[0]?.unit}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
