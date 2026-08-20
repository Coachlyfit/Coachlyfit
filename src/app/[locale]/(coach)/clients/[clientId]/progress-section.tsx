import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LineChart } from "lucide-react";
import { ProgressLineChart } from "@/components/charts/progress-line-chart";
import { ProgressKpiRow } from "@/components/progress/progress-kpi-row";
import { MetricCharts } from "@/components/progress/metric-charts";
import { PhotoTimeline } from "@/components/progress/photo-timeline";
import { ProgressService } from "@/domain/progress/progress.service";
import { checkinStreak, rangeStart, type ProgressRange } from "@/domain/progress/stats";
import { createClient } from "@/lib/supabase/server";
import type { AppLocale } from "@/domain/locale";

/** The expensive part of the coach's client-detail page: one Suspense
 * boundary around every progress query, keyed by range in the parent so a
 * range change re-triggers the skeleton instead of holding stale charts. */
export async function ProgressSection({
  clientId,
  range,
  locale,
}: {
  clientId: string;
  range: ProgressRange;
  locale: AppLocale;
}) {
  const tChart = await getTranslations("progress.chart");
  const tPhotos = await getTranslations("progress.photos");

  const supabase = await createClient();
  const progress = new ProgressService(supabase);
  const today = new Date();
  const since = rangeStart(range, today);

  const [history, grouped, media] = await Promise.all([
    progress.listCheckins(clientId, since),
    progress.listBodyMetricsGrouped(clientId, since),
    progress.listMedia(clientId, "photo", since),
  ]);

  const signed = await progress.signMediaUrls(media.map((m) => m.storage_path));
  const photos = media
    .filter((m) => signed.has(m.storage_path))
    .map((m) => ({ id: m.id, url: signed.get(m.storage_path)!, createdAt: m.created_at, pose: m.pose }));

  const weightData = history.filter((c) => c.weight != null).map((c) => ({ date: c.checkin_date, value: c.weight! }));
  const moodData = history.filter((c) => c.mood != null).map((c) => ({ date: c.checkin_date, value: c.mood! }));
  const energyData = history.filter((c) => c.energy != null).map((c) => ({ date: c.checkin_date, value: c.energy! }));
  const adherenceData = history
    .filter((c) => c.adherence != null)
    .map((c) => ({ date: c.checkin_date, value: c.adherence! }));

  return (
    <div className="flex flex-col gap-6">
      <ProgressKpiRow checkins={history} streak={checkinStreak(history, today)} locale={locale} />

      {history.length === 0 ? (
        <EmptyState icon={LineChart} title={tChart("emptyTitle")} description={tChart("emptyCoach")} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tChart("weightTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressLineChart data={weightData} label={tChart("weightTitle")} color="var(--chart-1)" unit="kg" />
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{tChart("moodTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ProgressLineChart data={moodData} label={tChart("moodTitle")} color="var(--chart-2)" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{tChart("energyTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ProgressLineChart data={energyData} label={tChart("energyTitle")} color="var(--chart-3)" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tChart("adherenceTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressLineChart data={adherenceData} label={tChart("adherenceTitle")} color="var(--chart-4)" unit="%" />
            </CardContent>
          </Card>
        </>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{tPhotos("title")}</h2>
        <PhotoTimeline
          photos={photos}
          locale={locale}
          emptyTitle={tPhotos("emptyTitle")}
          emptyDescription={tPhotos("emptyCoach")}
          deletable
          clientId={clientId}
        />
      </div>

      <MetricCharts grouped={grouped} />
    </div>
  );
}
