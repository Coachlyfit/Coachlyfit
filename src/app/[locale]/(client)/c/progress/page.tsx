import { getTranslations } from "next-intl/server";
import { LineChart } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { ProgressService } from "@/domain/progress/progress.service";
import { checkinStreak, adherenceAverage, weightTrend } from "@/domain/progress/stats";
import { metricPresetI18nKey } from "@/domain/progress/metric-presets";
import { PhotoTimeline } from "@/components/progress/photo-timeline";
import type { AppLocale } from "@/domain/locale";
import { CheckinForm } from "./checkin-form";
import { CheckinHero } from "./checkin-hero";
import { MetricSwitcher } from "./metric-switcher";
import { AddMetricDialog } from "./add-metric-dialog";
import { PhotoUpload } from "./photo-upload";

export default async function ClientProgressPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("progress");
  const tChart = await getTranslations("progress.chart");
  const tMetrics = await getTranslations("progress.metrics");
  const tPhotos = await getTranslations("progress.photos");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: client } = await supabase
    .from("clients")
    .select("id, coach_id")
    .eq("profile_id", user!.id)
    .single();

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const progress = new ProgressService(supabase);
  const [existing, history, grouped, media] = await Promise.all([
    progress.getCheckin(client!.id, todayIso),
    progress.listCheckins(client!.id),
    progress.listBodyMetricsGrouped(client!.id),
    progress.listMedia(client!.id, "photo"),
  ]);

  const signed = await progress.signMediaUrls(media.map((m) => m.storage_path));
  const photos = media
    .filter((m) => signed.has(m.storage_path))
    .map((m) => ({ id: m.id, url: signed.get(m.storage_path)!, createdAt: m.created_at }));

  const weightData = history.filter((c) => c.weight != null).map((c) => ({ date: c.checkin_date, value: c.weight! }));
  const moodData = history.filter((c) => c.mood != null).map((c) => ({ date: c.checkin_date, value: c.mood! }));
  const energyData = history.filter((c) => c.energy != null).map((c) => ({ date: c.checkin_date, value: c.energy! }));
  const adherenceData = history
    .filter((c) => c.adherence != null)
    .map((c) => ({ date: c.checkin_date, value: c.adherence! }));

  const series = [
    { key: "weight", label: tChart("weightTitle"), color: "var(--chart-1)", unit: "kg", data: weightData },
    { key: "mood", label: tChart("moodTitle"), color: "var(--chart-2)", data: moodData },
    { key: "energy", label: tChart("energyTitle"), color: "var(--chart-3)", data: energyData },
    { key: "adherence", label: tChart("adherenceTitle"), color: "var(--chart-4)", unit: "%", data: adherenceData },
    ...[...grouped.entries()].map(([metric, rows]) => {
      const presetKey = metricPresetI18nKey(metric);
      return {
        key: metric,
        label: presetKey ? tMetrics(presetKey) : metric.replace(/_/g, " "),
        color: "var(--chart-5)",
        unit: rows[0]?.unit,
        data: rows.map((r) => ({ date: r.taken_on, value: r.value })),
      };
    }),
  ].filter((s) => s.data.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <CheckinHero
        doneToday={existing != null}
        trend={weightTrend(history)}
        streak={checkinStreak(history, today)}
        adherence={adherenceAverage(history)}
        locale={locale}
      />

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{t("checkin.title")}</h2>
        <CheckinForm locale={locale} today={todayIso} existing={existing} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{tMetrics("title")}</h2>
        <AddMetricDialog locale={locale} />
      </div>
      {series.length > 0 ? (
        <MetricSwitcher series={series} />
      ) : (
        <EmptyState icon={LineChart} title={tChart("emptyTitle")} description={tChart("emptyClient")} />
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{tPhotos("title")}</h2>
        <PhotoTimeline
          photos={photos}
          locale={locale}
          emptyTitle={tPhotos("emptyTitle")}
          emptyDescription={tPhotos("emptyClient")}
          emptyAction={<PhotoUpload locale={locale} coachId={client!.coach_id} clientId={client!.id} />}
        />
        {photos.length > 0 && <PhotoUpload locale={locale} coachId={client!.coach_id} clientId={client!.id} />}
      </div>
    </div>
  );
}
