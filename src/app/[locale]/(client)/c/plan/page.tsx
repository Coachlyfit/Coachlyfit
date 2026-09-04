import { getTranslations } from "next-intl/server";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProgramsService } from "@/domain/programs/programs.service";
import { WorkoutsService } from "@/domain/workouts/workouts.service";
import { dayIndicesForWeek, dayIndicesForWeekWithMode, startOfWeekSaturday } from "@/domain/programs/program-cycle";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  const scheduleMode = tree.schedule_mode as "cycle" | "weekly";
  const indices =
    scheduleMode === "weekly"
      ? dayIndicesForWeekWithMode(
          "weekly",
          tree.start_date,
          cycleLength,
          weekStart,
          new Map(
            tree.program_days
              .filter((d) => d.weekday != null)
              .map((d) => [d.weekday as number, d.day_index])
          )
        )
      : dayIndicesForWeek(tree.start_date, cycleLength, weekStart);

  const days = indices.map((dayIndex, i) => {
    const date = new Date(new Date(weekStart).getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const day = dayIndex != null ? tree.program_days.find((d) => d.day_index === dayIndex) : null;
    const isRest = !day || day.program_items.length === 0;
    const isToday = date === todayIso;
    return { date, day, isRest, isToday };
  });

  const sessionsByDayId = new Map(
    (
      await Promise.all(
        days
          .filter((d) => d.day && !d.isRest)
          .map(async (d) => [d.day!.id, await workouts.getSessionForDay(d.day!.id)] as const)
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
        {days.map(({ date, day, isRest, isToday }) => {
          const session = day ? sessionsByDayId.get(day.id) : undefined;
          const done = session != null;
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
                  {isRest ? t("rest") : pickLocale(day!, locale, "label") || t("today")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isRest
                    ? t("restMeta")
                    : done
                      ? t("doneMeta", { minutes: Math.round((session!.duration_seconds ?? 0) / 60) })
                      : t("exerciseCount", { count: day!.program_items.length })}
                </p>
              </div>
              {done && <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />}
              {isToday && !done && !isRest && (
                <TodayMark className="size-4 shrink-0 text-warning-tint-foreground" aria-hidden="true" />
              )}
            </div>
          );

          return day && !isRest ? (
            <Link key={date} href={`/c/workout/${day.id}`}>
              {content}
            </Link>
          ) : (
            <div key={date}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}
