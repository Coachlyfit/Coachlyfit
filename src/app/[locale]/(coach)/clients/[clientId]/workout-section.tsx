import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dumbbell, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsService } from "@/domain/workouts/workouts.service";
import { computePersonalRecords } from "@/domain/progress/prs";
import { PrList, type PrListRow } from "@/components/progress/pr-list";
import { pickLocale, pickBilingual, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";

/** Coach-facing compliance view — sits alongside ProgressSection on the
 * client detail page. Read-only: RLS's coach_read (select-only) on
 * workout_sessions/workout_set_logs already scopes this to the caller's
 * own clients, no separate authorization needed here. */
export async function WorkoutSection({ clientId, locale }: { clientId: string; locale: AppLocale }) {
  const t = await getTranslations("clients.workouts");
  const tPrs = await getTranslations("progress.prs");
  const supabase = await createClient();
  const workouts = new WorkoutsService(supabase);
  const [sessions, logs, painReports] = await Promise.all([
    workouts.listRecentSessions(clientId),
    workouts.listSetLogsForClient(clientId),
    workouts.listPainReports(clientId),
  ]);

  const records = computePersonalRecords(logs);
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

  return (
    <div className="flex flex-col gap-4">
      {painReports.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {t("painReports")}
          </p>
          {painReports.map((report) => (
            <p key={report.id} className="text-xs text-muted-foreground">
              {t("painReportLine", {
                exercise: report.program_items?.exercises
                  ? pickBilingual(
                      {
                        ar: report.program_items.exercises.name_ar,
                        en: report.program_items.exercises.name_en,
                      },
                      locale
                    )
                  : t("unknownExercise"),
                pain: report.pain ?? 0,
                date: formatDate(report.created_at, locale, { dateStyle: "medium" }),
              })}
              {report.notes ? ` — ${report.notes}` : ""}
            </p>
          ))}
        </div>
      )}

      <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
      {sessions.length === 0 ? (
        <EmptyState icon={Dumbbell} title={t("empty")} />
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => {
            const label = session.program_days
              ? pickLocale(session.program_days, locale, "label")
              : "";
            const done = session.completed_at != null;
            return (
              <Card key={session.id}>
                <CardContent className="flex flex-col gap-1.5 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{label || t("title")}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(session.started_at, locale, { dateStyle: "medium" })}
                      </p>
                    </div>
                    <span className={done ? "text-sm text-success" : "text-sm text-muted-foreground"}>
                      {done ? t("completed") : t("inProgress")}
                    </span>
                  </div>
                  {session.swaps.map((swap, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {t("swapped", {
                        original: pickBilingual(swap.original, locale),
                        substitute: pickBilingual(swap.substitute, locale),
                      })}
                    </p>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="text-lg font-semibold tracking-tight">{tPrs("title")}</h2>
      <PrList rows={prRows} locale={locale} />
    </div>
  );
}
