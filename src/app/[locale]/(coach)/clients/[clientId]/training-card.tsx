import { getTranslations } from "next-intl/server";
import { Dumbbell, ExternalLink, HeartPulse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { dayIndexForDate, dayIndexForDateWithMode, dayIndicesForWeek, dayIndicesForWeekWithMode, startOfWeekSaturday, weekIndexForDate } from "@/domain/programs/program-cycle";
import { WorkoutsService } from "@/domain/workouts/workouts.service";
import { ProgramsService } from "@/domain/programs/programs.service";
import { ActivityLogsService } from "@/domain/workouts/activity-logs.service";
import { getActiveProgram } from "./data";
import { AssignPlanDialog } from "./assign-plan-dialog";

export async function TrainingCard({ clientId, locale }: { clientId: string; locale: AppLocale }) {
  const t = await getTranslations("clients.profile.training");
  const supabase = await createClient();
  const program = await getActiveProgram(clientId);

  if (!program) {
    const templates = await new ProgramsService(supabase).list("templates");
    return (
      <Card>
        <CardContent className="py-2">
          <EmptyState
            icon={Dumbbell}
            title={t("empty")}
            description={t("emptyDescription")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <AssignPlanDialog
                  kind="program"
                  locale={locale}
                  clientId={clientId}
                  templates={templates.map((p) => ({ id: p.id, name: pickLocale(p, locale) }))}
                  replaceActive={false}
                  trigger={t("assign")}
                />
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/programs?client=${clientId}`} />}>
                  {t("create")}
                </Button>
              </div>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const cycleLength = program.program_days.length;
  const todayIndex =
    program.schedule_mode === "weekly"
      ? dayIndexForDateWithMode(
          "weekly",
          program.start_date,
          cycleLength,
          todayIso,
          new Map(program.program_days.filter((d) => d.weekday != null).map((d) => [d.weekday as number, d.day_index]))
        )
      : dayIndexForDate(program.start_date, cycleLength, todayIso);
  const todayDay = program.program_days.find((d) => d.day_index === todayIndex) ?? null;
  const isRestDay = todayIndex != null && (!todayDay || todayDay.program_items.length === 0);
  const week = weekIndexForDate(program.start_date, todayIso);

  const [templates, recentSessions, painReports] = await Promise.all([
    new ProgramsService(supabase).list("templates"),
    new WorkoutsService(supabase).listRecentSessions(clientId, 1),
    new WorkoutsService(supabase).listPainReports(clientId, 3),
  ]);
  const lastSession = recentSessions.find((s) => s.completed_at != null) ?? null;

  // Cardio prescribed vs logged this week — one count each, from the 7
  // program_activities scheduled across this Sat-Fri week (may repeat a
  // day more than once if the cycle is short) and how many of those actual
  // (day, activity) pairs have a matching activity_logs row.
  const weekStart = startOfWeekSaturday(todayIso);
  const weekIndices =
    program.schedule_mode === "weekly"
      ? dayIndicesForWeekWithMode(
          "weekly",
          program.start_date,
          cycleLength,
          weekStart,
          new Map(program.program_days.filter((d) => d.weekday != null).map((d) => [d.weekday as number, d.day_index]))
        )
      : dayIndicesForWeek(program.start_date, cycleLength, weekStart);
  const weekDates = Array.from({ length: 7 }, (_, i) => new Date(new Date(weekStart).getTime() + i * 86_400_000).toISOString().slice(0, 10));
  const weekDays = weekIndices.map((idx) => (idx != null ? program.program_days.find((d) => d.day_index === idx) : null));
  const activityLogs = new ActivityLogsService(supabase);
  const cardioByDate = await Promise.all(
    weekDays.map(async (d, i) => {
      const cardioActivities = (d?.program_activities ?? []).filter((a) => a.kind === "cardio");
      if (cardioActivities.length === 0) return { prescribed: 0, done: 0 };
      const logs = await activityLogs.listForDate(clientId, weekDates[i]);
      const loggedIds = new Set(logs.map((l) => l.program_activity_id));
      return { prescribed: cardioActivities.length, done: cardioActivities.filter((a) => loggedIds.has(a.id)).length };
    })
  );
  const cardioPrescribedCount = cardioByDate.reduce((sum, d) => sum + d.prescribed, 0);
  const cardioDoneCount = cardioByDate.reduce((sum, d) => sum + d.done, 0);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <CardTitle className="truncate text-base">{pickLocale(program, locale)}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("weekAndDay", {
              week,
              day: isRestDay ? t("restDay") : todayDay ? pickLocale(todayDay, locale, "label") || t("dayN", { n: todayDay.day_index }) : t("restDay"),
            })}
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">{program.schedule_mode === "weekly" ? t("weekly") : t("cycle")}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {program.end_date
              ? t("dateRange", {
                  start: formatDate(program.start_date, locale),
                  end: formatDate(program.end_date, locale),
                })
              : t("startedOn", { date: formatDate(program.start_date, locale) })}
          </span>
          <span>{t("dayCount", { count: cycleLength })}</span>
        </div>

        {lastSession && (
          <p className="text-sm">
            {t("lastWorkout", {
              date: formatDate(lastSession.started_at, locale),
              completed: lastSession.sets_completed ?? 0,
              prescribed: lastSession.sets_prescribed ?? 0,
            })}
          </p>
        )}

        {cardioPrescribedCount > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("cardioThisWeek", { done: cardioDoneCount, total: cardioPrescribedCount })}
          </p>
        )}

        {painReports.length > 0 && (
          <div className="flex flex-col gap-1 rounded-md border border-warning-tint bg-warning-tint/40 p-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-warning-tint-foreground">
              <HeartPulse className="size-3.5" aria-hidden="true" />
              {t("recentPain")}
            </p>
            {painReports.map((report) => (
              <p key={report.id} className="text-xs text-warning-tint-foreground/80">
                {t("painLine", {
                  exercise: report.program_items?.exercises ? pickLocale(report.program_items.exercises, locale) : "",
                  pain: report.pain ?? 0,
                  date: formatDate(report.created_at, locale),
                })}
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" nativeButton={false} render={<Link href={`/programs/${program.id}`} />}>
            <ExternalLink className="size-4" />
            {t("open")}
          </Button>
          <AssignPlanDialog
            kind="program"
            locale={locale}
            clientId={clientId}
            templates={templates.map((p) => ({ id: p.id, name: pickLocale(p, locale) }))}
            replaceActive
            trigger={t("replace")}
            variant="outline"
          />
        </div>
      </CardContent>
    </Card>
  );
}
