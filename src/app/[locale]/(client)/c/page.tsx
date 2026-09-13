import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { WeeklyProgressRing } from "@/components/progress/weekly-progress-ring";
import { createClient } from "@/lib/supabase/server";
import { ProgressService } from "@/domain/progress/progress.service";
import { WorkoutsService } from "@/domain/workouts/workouts.service";
import { ProgramsService } from "@/domain/programs/programs.service";
import { dayIndexForDate, dayIndexForDateWithMode, startOfWeekSaturday } from "@/domain/programs/program-cycle";
import { checkinStreak, longestStreak, weightTrend } from "@/domain/progress/stats";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import { tintFor } from "@/lib/tint";
import { TodayExercisePreview } from "./today-exercise-preview";

export default async function ClientHomePage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("client");
  const tToday = await getTranslations("client.today");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: clientRow }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user!.id).single(),
    supabase.from("clients").select("id, coach_id, coaches(business_name)").eq("profile_id", user!.id).single(),
  ]);

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const progress = new ProgressService(supabase);
  const programs = new ProgramsService(supabase);
  const workouts = new WorkoutsService(supabase);

  const [existingCheckin, history, tree] = await Promise.all([
    clientRow ? progress.getCheckin(clientRow.id, todayIso) : null,
    clientRow ? progress.listCheckins(clientRow.id) : [],
    clientRow ? programs.getActiveTreeForClient(clientRow.id) : null,
  ]);

  const cycleLength = tree?.program_days.length ?? 0;
  const todayIndex = tree
    ? tree.schedule_mode === "weekly"
      ? dayIndexForDateWithMode(
          "weekly",
          tree.start_date,
          cycleLength,
          todayIso,
          new Map(
            tree.program_days
              .filter((d) => d.weekday != null)
              .map((d) => [d.weekday as number, d.day_index])
          )
        )
      : dayIndexForDate(tree.start_date, cycleLength, todayIso)
    : null;
  const todayDay = tree?.program_days.find((d) => d.day_index === todayIndex) ?? null;
  const isRestDay = tree != null && todayIndex != null && (!todayDay || todayDay.program_items.length === 0);

  const session = todayDay
    ? await workouts.getSessionForDay(todayDay.id, startOfWeekSaturday(todayIso))
    : null;
  const workoutDone = session?.completed_at != null;

  const weekPct = cycleLength > 0 ? Math.round(((todayIndex ?? 1) / cycleLength) * 100) : 0;
  const trend = weightTrend(history);
  const firstWeighed = history.find((c) => c.weight != null);
  const sinceStartDelta = trend && firstWeighed?.weight != null ? trend.latest - firstWeighed.weight : null;
  const streak = checkinStreak(history, today);
  const best = longestStreak(history);
  const checkinDue = !existingCheckin;
  const totalSets = todayDay?.program_items.reduce((sum, item) => sum + item.sets, 0) ?? 0;

  const ChevronIcon = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight">
          {t("welcome", { name: profile?.full_name ?? "" })}
        </h1>
        {clientRow && (
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${tintFor(clientRow.id)}`}
            aria-hidden="true"
          >
            {(profile?.full_name ?? "?")[0]}
          </div>
        )}
      </div>

      <Card className="border-none bg-sidebar text-sidebar-foreground">
        <CardContent className="flex items-center gap-5">
          {cycleLength > 0 && (
            <WeeklyProgressRing pct={weekPct} locale={locale} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {tree
                ? tToday("weekProgress", { n: todayIndex ?? 1, total: cycleLength })
                : tToday("noProgram")}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-sidebar-foreground/70">
              {tree ? (workoutDone ? tToday("weekLineDone") : tToday("weekLine")) : tToday("noProgramBody")}
            </p>
          </div>
        </CardContent>
      </Card>

      {checkinDue && (
        <Link
          href="/c/checkin"
          className="flex min-h-11 items-center gap-3.5 rounded-2xl border border-warning-tint bg-warning-tint px-4 py-4 text-start"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-warning-tint-foreground">{tToday("checkinBanner")}</p>
            <p className="mt-0.5 text-xs text-warning-tint-foreground/80">
              {tToday("checkinBannerMeta", { count: 5 })}
            </p>
          </div>
          <ChevronIcon className="size-4.5 shrink-0 text-warning-tint-foreground" aria-hidden="true" />
        </Link>
      )}

      {isRestDay ? (
        <Card>
          <CardContent>
            <EmptyState title={tToday("restDay")} description={tToday("restDayBody")} />
          </CardContent>
        </Card>
      ) : todayDay ? (
        <Card>
          <CardContent className="flex flex-col gap-3.5 p-0">
            <div className="px-4.5 pt-4 pb-3.5">
              <p className="font-mono text-[9.5px] font-medium tracking-wider text-muted-foreground uppercase">
                {tToday("todayWorkout")}
              </p>
              <p className="mt-1.5 text-[17px] font-semibold">
                {todayDay.label_ar || todayDay.label_en ? pickLocale(todayDay, locale, "label") : tToday("todayWorkout")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tToday("exerciseCount", { count: todayDay.program_items.length })}
                {" · "}
                {tToday("setCount", { count: totalSets })}
              </p>
            </div>
            <TodayExercisePreview locale={locale} items={todayDay.program_items.slice(0, 4)} />
            <div className="px-4.5 pb-4.5">
              <Link
                href={`/c/workout/${todayDay.id}`}
                className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
              >
                {workoutDone ? tToday("reviewWorkout") : session ? tToday("resumeWorkout") : tToday("startWorkout")}
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="gap-1.5 p-4">
            <p className="font-mono text-[9.5px] font-medium tracking-wider text-muted-foreground uppercase">
              {tToday("currentWeight")}
            </p>
            {trend ? (
              <>
                <p className="font-mono text-[22px] font-semibold tabular-nums">
                  {formatNumber(trend.latest, locale, { maximumFractionDigits: 1 })}{" "}
                  <span className="text-xs font-normal text-muted-foreground">kg</span>
                </p>
                {sinceStartDelta != null && (
                  <p className={`text-xs ${sinceStartDelta <= 0 ? "text-success" : "text-muted-foreground"}`}>
                    {tToday("weightSinceStart", {
                      delta: `${sinceStartDelta > 0 ? "+" : ""}${formatNumber(sinceStartDelta, locale, { maximumFractionDigits: 1 })}`,
                    })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="gap-1.5 p-4">
            <p className="font-mono text-[9.5px] font-medium tracking-wider text-muted-foreground uppercase">
              {tToday("streak")}
            </p>
            <p className="font-mono text-[22px] font-semibold tabular-nums">
              {formatNumber(streak, locale)} <span className="text-xs font-normal text-muted-foreground">{tToday("streakDays", { count: streak })}</span>
            </p>
            {best > streak && (
              <p className="text-xs text-muted-foreground">{tToday("streakBest", { count: best })}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {clientRow?.coaches && (
        <p className="text-sm text-muted-foreground">
          {t("coachedBy", { business: clientRow.coaches.business_name })}
        </p>
      )}
    </div>
  );
}
