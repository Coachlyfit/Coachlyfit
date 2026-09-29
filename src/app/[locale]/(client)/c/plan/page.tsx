import { getTranslations } from "next-intl/server";
import { CheckCircle2, ChevronLeft, ChevronRight, HeartPulse, Wind, Salad } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProgramsService } from "@/domain/programs/programs.service";
import { WorkoutsService } from "@/domain/workouts/workouts.service";
import { resolveDayPlan } from "@/domain/programs/day-plan";
import { startOfWeekSaturday } from "@/domain/programs/program-cycle";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TodayExercisePreview } from "../today-exercise-preview";

export default async function ClientPlanPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("client.plan");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: clientRow } = await supabase.from("clients").select("id").eq("profile_id", user!.id).single();

  const programs = new ProgramsService(supabase);
  const workouts = new WorkoutsService(supabase);
  const tree = clientRow ? await programs.getActiveTreeForClient(clientRow.id) : null;

  if (!tree) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <EmptyState title={t("noProgram")} description={t("noProgramBody")} />
      </div>
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const weekStart = startOfWeekSaturday(todayIso);
  const cycleLength = tree.program_days.length;

  // resolveDayPlan per date, not dayIndicesForWeek/WithMode directly — it's
  // the one place workoutItems/rehabItems/activities/kind are all derived
  // consistently (see day-plan.ts), so this strip and c/page.tsx's Today
  // card never disagree about what a given date's day actually is.
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(new Date(weekStart).getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const plan = resolveDayPlan(tree, date);
    const isRest = plan.kind === "rest";
    const isToday = date === todayIso;
    return { date, plan, isRest, isToday };
  });

  const sessionsByDayId = new Map(
    (
      await Promise.all(
        days
          .filter((d) => d.plan.day && d.plan.workoutItems.length > 0)
          .map(async (d) => [d.plan.day!.id, await workouts.getSessionForDay(d.plan.day!.id, weekStart)] as const)
      )
    ).filter(([, session]) => session?.completed_at != null)
  );

  const TodayMark = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <Link href="/c/history" className="text-sm font-medium text-primary">
          {t("historyLink")}
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {days.map(({ date, plan, isRest, isToday }) => {
          const day = plan.day;
          const hasWorkout = plan.workoutItems.length > 0;
          const session = hasWorkout && day ? sessionsByDayId.get(day.id) : undefined;
          const done = session != null;
          const hasRehab = plan.rehabItems.length > 0 || plan.mobilityItems.length > 0;
          const content = (
            <div
              className={cn(
                "flex min-h-11 items-center gap-3.5 rounded-2xl border px-4 py-4",
                isToday ? "border-warning-tint bg-warning-tint" : isRest ? "border-border bg-muted" : "border-border bg-card"
              )}
            >
              <div className="flex w-9.5 shrink-0 flex-col items-center text-center">
                <span className="font-mono text-[9.5px] text-muted-foreground">
                  {formatDate(date, locale, { weekday: "short" })}
                </span>
                <span className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums">
                  {formatDate(date, locale, { day: "numeric" })}
                </span>
              </div>
              <div className="h-full w-px self-stretch bg-border" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className={cn("text-[13.5px] font-semibold", isRest && "text-muted-foreground")}>
                  {isRest ? t("rest") : day ? pickLocale(day, locale, "label") || t("today") : t("today")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isRest
                    ? t("restMeta")
                    : hasWorkout
                      ? done
                        ? t("doneMeta", { minutes: Math.round((session!.duration_seconds ?? 0) / 60) })
                        : t("exerciseCount", { count: plan.workoutItems.length })
                      : hasRehab
                        ? t("exerciseCount", { count: plan.rehabItems.length + plan.mobilityItems.length })
                        : t("restMeta")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {plan.activities.length > 0 &&
                  (plan.activities.some((a) => a.kind === "cardio") ? (
                    <HeartPulse className="size-3.5 text-orange-500" aria-hidden="true" />
                  ) : (
                    <Wind className="size-3.5 text-sky-500" aria-hidden="true" />
                  ))}
                {plan.dietPlanId && <Salad className="size-3.5 text-muted-foreground" aria-hidden="true" />}
              </div>
              {done && <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />}
              {isToday && !done && !isRest && (
                <TodayMark className="size-4 shrink-0 text-warning-tint-foreground" aria-hidden="true" />
              )}
            </div>
          );

          // Only today (still startable) or an already-done day (reviewable)
          // link straight into the workout route, which starts/resumes a
          // session on load — a past day that was never done, or a future
          // one, must not spawn a session just from being tapped to view.
          // Those expand in place to a read-only exercise list instead.
          if (day && (hasWorkout || hasRehab) && (isToday || done)) {
            return (
              <Link key={date} href={`/c/workout/${day.id}`}>
                {content}
              </Link>
            );
          }
          if (hasWorkout || hasRehab) {
            return (
              <details key={date}>
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{content}</summary>
                <div className="pt-3">
                  <TodayExercisePreview
                    locale={locale}
                    items={hasWorkout ? plan.workoutItems : [...plan.mobilityItems, ...plan.rehabItems]}
                  />
                </div>
              </details>
            );
          }
          return <div key={date}>{content}</div>;
        })}
      </div>
    </div>
  );
}
