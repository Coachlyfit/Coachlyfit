import { getTranslations } from "next-intl/server";
import { AlertTriangle, Dumbbell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { ProgressLineChart } from "@/components/charts/progress-line-chart";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsService } from "@/domain/workouts/workouts.service";
import { dateBounds, historyQuery, topSetsBySession, type HistoryParams } from "@/domain/workouts/weight-history";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate, formatNumber } from "@/lib/format";
import { WeightHistoryFilters } from "./weight-history-filters";
import { WeightHistoryTable } from "./weight-history-table";

/** Every query runs through the request's RLS-scoped client: coach_read on
 * workout_sessions/workout_set_logs (and the security-invoker
 * exercise_bests) only ever returns rows of clients this coach may see, so a
 * forged clientId or search param yields an empty page, never someone
 * else's data. `params` is already validated by parseHistoryParams. */
async function loadHistory(clientId: string, locale: AppLocale, params: HistoryParams) {
  const supabase = await createClient();
  const workouts = new WorkoutsService(supabase);
  const bounds = dateBounds(params.from, params.to);

  const [{ sessions, hasMore }, bests] = await Promise.all([
    workouts.listHistorySessions(clientId, { ...bounds, exerciseId: params.exerciseId, limit: params.limit }),
    workouts.listExerciseBests(clientId, bounds),
  ]);

  const ids = [...new Set([...bests.map((b) => b.exercise_id), ...(params.exerciseId ? [params.exerciseId] : [])])];
  const { data: exerciseRows, error } =
    ids.length > 0
      ? await supabase.from("exercises").select("id, name_ar, name_en").in("id", ids)
      : { data: [], error: null };
  if (error) throw error;
  const names = new Map((exerciseRows ?? []).map((e) => [e.id, pickLocale(e, locale)]));

  // Chart: the selected exercise, else the one logged most often.
  const chartId = params.exerciseId ?? [...bests].sort((a, b) => b.set_count - a.set_count)[0]?.exercise_id ?? null;
  const chartData = chartId ? topSetsBySession(await workouts.listExerciseSeries(clientId, chartId, bounds)) : [];

  return { sessions, hasMore, bests, ids, names, chartId, chartData };
}

export async function WeightHistorySection({
  clientId,
  locale,
  params,
}: {
  clientId: string;
  locale: AppLocale;
  params: HistoryParams;
}) {
  const t = await getTranslations("clients.weightHistory");

  let data: Awaited<ReturnType<typeof loadHistory>> | null = null;
  try {
    data = await loadHistory(clientId, locale, params);
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
        <EmptyState
          icon={AlertTriangle}
          title={t("error")}
          description={t("errorDescription")}
          action={
            // Plain anchor: a full reload re-runs the server fetch with the same filters.
            <a href={historyQuery(params)} className={buttonVariants({ variant: "outline" })}>
              {t("retry")}
            </a>
          }
        />
      </div>
    );
  }

  const { sessions, hasMore, bests, ids, names, chartId, chartData } = data;
  const nameOf = (id: string) => names.get(id) || t("unknownExercise");
  const options = ids.map((id) => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name));
  const bestRows = bests
    .filter((b) => b.best_weight > 0 && (!params.exerciseId || b.exercise_id === params.exerciseId))
    .sort((a, b) => nameOf(a.exercise_id).localeCompare(nameOf(b.exercise_id)));

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
      <WeightHistoryFilters exercises={options} exerciseId={params.exerciseId} from={params.from} to={params.to} />

      {sessions.length === 0 ? (
        <EmptyState icon={Dumbbell} title={t("empty")} description={t("emptyDescription")} />
      ) : (
        <>
          {bestRows.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-base font-semibold tracking-tight">{t("bestSets")}</h3>
              <div className="flex flex-col rounded-xl border border-border bg-card">
                {bestRows.map((b) => (
                  <div key={b.exercise_id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-sm">{nameOf(b.exercise_id)}</span>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        {t("bestSetLine", {
                          weight: formatNumber(b.best_weight, locale, { maximumFractionDigits: 1 }),
                          reps: b.best_reps ?? "—",
                        })}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {formatDate(b.best_at, locale, { dateStyle: "medium" })} · {t("setCount", { count: b.set_count })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {chartId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("chartTitle", { exercise: nameOf(chartId) })}</CardTitle>
              </CardHeader>
              <CardContent>
                <ProgressLineChart data={chartData} label={nameOf(chartId)} color="var(--chart-1)" unit="kg" />
              </CardContent>
            </Card>
          )}

          <WeightHistoryTable sessions={sessions} hasMore={hasMore} params={params} locale={locale} />
        </>
      )}
    </div>
  );
}
