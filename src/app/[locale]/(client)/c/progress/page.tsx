import { getTranslations } from "next-intl/server";
import { LineChart } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { ProgressService } from "@/domain/progress/progress.service";
import { MetricDefinitionsService } from "@/domain/progress/metric-definitions.service";
import { WorkoutsService } from "@/domain/workouts/workouts.service";
import { checkinStreak, adherenceAverage, weightTrend } from "@/domain/progress/stats";
import { metricPresetI18nKey } from "@/domain/progress/metric-presets";
import { computePersonalRecords } from "@/domain/progress/prs";
import { pickLocale } from "@/domain/locale";
import { PhotoTimeline } from "@/components/progress/photo-timeline";
import { PrList, type PrListRow } from "@/components/progress/pr-list";
import { PlanStory } from "@/components/ledger/plan-story";
import { LedgerService } from "@/domain/ledger/ledger.service";
import { toPlanStoryEntry } from "@/domain/ledger/view";
import type { AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
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
  const tPrs = await getTranslations("progress.prs");
  const tPlanStory = await getTranslations("progress.planStory");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: client } = await supabase
    .from("clients")
    .select("id, coach_id")
    .eq("profile_id", user!.id)
    .single();

  if (!client) {
    throw new Error("Client profile not found for authenticated user.");
  }

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const progress = new ProgressService(supabase);
  const [existing, history, grouped, media, customMetrics] = await Promise.all([
    progress.getCheckin(client!.id, todayIso),
    progress.listCheckins(client!.id),
    progress.listBodyMetricsGrouped(client!.id),
    progress.listMedia(client!.id, "photo"),
    new MetricDefinitionsService(supabase).list(client!.coach_id),
  ]);

  const planStoryDecisions = await new LedgerService(supabase).listForClient(client!.id);
  const planStoryEntries = planStoryDecisions.map((d) => toPlanStoryEntry(d));

  const setLogs = await new WorkoutsService(supabase).listSetLogsForClient(client!.id);
  const records = computePersonalRecords(setLogs);
  let prRows: PrListRow[] = [];
  if (records.length > 0) {
    const { data: exercises } = await supabase
      .from("exercises")
      .select("id, name_ar, name_en")
      .in(
        "id",
        records.map((r) => r.exerciseId)
      );
    const nameById = new Map((exercises ?? []).map((e) => [e.id, { name_ar: e.name_ar, name_en: e.name_en }]));
    prRows = records
      .filter((r) => nameById.has(r.exerciseId))
      .map((r) => ({
        exerciseId: r.exerciseId,
        exerciseName: nameById.get(r.exerciseId)!,
        maxWeight: r.maxWeight ? { weight: r.maxWeight.weight, reps: r.maxWeight.reps } : null,
        estimatedOneRepMax: r.estimatedOneRepMax?.value ?? null,
      }))
      .sort((a, b) => pickLocale(a.exerciseName, locale).localeCompare(pickLocale(b.exerciseName, locale)));
  }

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

  const customLabelByKey = Object.fromEntries(
    customMetrics.map((m) => [m.key, pickLocale(m, locale, "label")])
  );

  const series: { key: string; label: string; color: string; unit?: string; data: { date: string; value: number }[] }[] = [
    { key: "weight", label: tChart("weightTitle"), color: "var(--chart-1)", unit: "kg", data: weightData },
    { key: "mood", label: tChart("moodTitle"), color: "var(--chart-2)", data: moodData },
    { key: "energy", label: tChart("energyTitle"), color: "var(--chart-3)", data: energyData },
    { key: "adherence", label: tChart("adherenceTitle"), color: "var(--chart-4)", unit: "%", data: adherenceData },
    ...[...grouped.entries()].map(([metric, rows]) => {
      const presetKey = metricPresetI18nKey(metric);
      return {
        key: metric,
        label: presetKey ? tMetrics(presetKey) : (customLabelByKey[metric] ?? metric.replace(/_/g, " ")),
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
        <CheckinForm
          locale={locale}
          today={todayIso}
          existing={existing}
          coachId={client!.coach_id}
          clientId={client!.id}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{tPlanStory("title")}</h2>
        <PlanStory locale={locale} entries={planStoryEntries} emptyTitle={tPlanStory("empty")} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{tMetrics("title")}</h2>
        <AddMetricDialog locale={locale} customMetrics={customMetrics} />
      </div>
      {series.length > 0 ? (
        <>
          <MetricSwitcher series={series} />
          <div className="flex flex-col rounded-xl border border-border bg-card">
            {series.map((s) => {
              const last = s.data[s.data.length - 1];
              const prev = s.data[s.data.length - 2];
              const delta = prev ? last.value - prev.value : null;
              return (
                <div key={s.key} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                  <span className="flex-1 truncate text-sm">{s.label}</span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatNumber(last.value, locale, { maximumFractionDigits: 1 })}
                    {s.unit ? ` ${s.unit}` : ""}
                  </span>
                  {delta != null && (
                    <span
                      className={`font-mono text-xs tabular-nums ${delta <= 0 ? "text-success" : "text-muted-foreground"}`}
                    >
                      {delta > 0 ? "+" : ""}
                      {formatNumber(delta, locale, { maximumFractionDigits: 1 })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState icon={LineChart} title={tChart("emptyTitle")} description={tChart("emptyClient")} />
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{tPrs("title")}</h2>
        <PrList rows={prRows} locale={locale} />
      </div>

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
