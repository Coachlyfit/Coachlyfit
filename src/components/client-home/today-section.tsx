import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, Dumbbell, HeartPulse, Moon, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "@/i18n/navigation";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { ResolvedDayPlan } from "@/domain/programs/day-plan";
import { normalizeSectionOrder } from "@/domain/programs/day-sections";
import { formatNumber } from "@/lib/format";
import { TodayActivityCard } from "@/app/[locale]/(client)/c/today-activity-card";
import { NextMeal, type MealSlot } from "./next-meal";
import { num } from "./num";

const ROW = "flex min-h-11 items-center gap-3 rounded-[14px] bg-card px-3.5 py-3 text-start ring-1 ring-foreground/10";
const PILL = "flex h-9 shrink-0 items-center rounded-[9px] bg-primary px-3.5 font-semibold text-primary-foreground";

/** An extra session of today's day (an AM/PM split), ready to render. */
export type TodaySession = {
  id: string;
  label: string | null;
  exercises: number;
  sets: number;
  state: "new" | "resume" | "done";
};

export type NutritionToday = {
  targetKcal: number | null;
  /** From today's nutrition_logs row; null when the client hasn't logged. */
  eatenKcal: number | null;
  meals: MealSlot[];
};

/** The day's agenda as compact rows: coach note + rehab phase, then the
 * coach-ordered workout / mobility-rehab / activity sections (or a rest-day
 * row), then nutrition. */
export async function TodaySection({
  locale,
  plan,
  workoutState,
  sessions = [],
  loggedActivityIds,
  nutrition,
}: {
  locale: AppLocale;
  /** null = no active program. */
  plan: ResolvedDayPlan | null;
  workoutState: "new" | "resume" | "done";
  /** Extra sessions of today's day; the first workout row above is session 1. */
  sessions?: TodaySession[];
  loggedActivityIds: string[];
  /** null = no nutrition plan. */
  nutrition: NutritionToday | null;
}) {
  const t = await getTranslations("client.overview");
  const tToday = await getTranslations("client.today");
  const tDiet = await getTranslations("client.diet");
  const Chevron = locale === "ar" ? ChevronLeft : ChevronRight;
  const logged = new Set(loggedActivityIds);

  const sections =
    plan?.day == null
      ? []
      : normalizeSectionOrder(plan.day.section_order).filter((key) => {
          if (key === "workout") return plan.workoutItems.length > 0;
          if (key === "mobility_rehab") return plan.rehabItems.length > 0 || plan.mobilityItems.length > 0;
          return plan.activities.length > 0;
        });
  const activeProtocol = plan?.protocols.find((p) => p.activePhase != null) ?? null;
  const totalSets = plan?.workoutItems.reduce((sum, item) => sum + item.sets, 0) ?? 0;
  const actionLabel = workoutState === "done" ? t("review") : workoutState === "resume" ? t("resume") : t("start");

  return (
    <section aria-labelledby="today-h" className="flex flex-col gap-2">
      <h2 id="today-h" className="text-base font-semibold">
        {t("todayTitle")}
      </h2>

      {plan?.day && (plan.day.notes_ar || plan.day.notes_en) && (
        <div className={ROW}>
          <StickyNote className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{pickLocale(plan.day, locale, "notes")}</p>
        </div>
      )}

      {/* Restrictions come before the workout: it's what the client most
          needs to see before they start moving. */}
      {activeProtocol && (
        <div className="flex flex-col gap-1 rounded-[14px] bg-warning-tint px-3.5 py-3 text-warning-tint-foreground">
          <p className="font-mono text-[10px] font-medium tracking-wider uppercase">
            {tToday("rehabPhase", { area: activeProtocol.body_area })}
          </p>
          <p className="text-sm font-semibold">{pickLocale(activeProtocol.activePhase, locale)}</p>
          {(activeProtocol.restrictions_ar || activeProtocol.restrictions_en) && (
            <p className="text-xs">{pickLocale(activeProtocol, locale, "restrictions")}</p>
          )}
        </div>
      )}

      {plan && (plan.day == null || sections.length === 0) ? (
        <div className={ROW}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Moon className="size-5" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-snug">
            <span className="font-semibold">{tToday("restDay")}</span>
            <span className="text-sm text-muted-foreground">{tToday("restDayBody")}</span>
          </span>
        </div>
      ) : (
        plan?.day &&
        sections.map((key) => {
          const day = plan.day!;
          if (key === "workout") {
            return (
              <Link key={key} href={`/c/workout/${day.id}`} className={ROW}>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sidebar text-sidebar-foreground">
                  <Dumbbell className="size-5" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-snug">
                  <span className="truncate font-semibold">
                    {day.label_ar || day.label_en ? pickLocale(day, locale, "label") : tToday("todayWorkout")}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t.rich("workoutMeta", {
                      exercises: formatNumber(plan.workoutItems.length, locale),
                      sets: formatNumber(totalSets, locale),
                      num,
                    })}
                  </span>
                </span>
                {workoutState === "done" ? <Badge variant="success">{t("doneBadge")}</Badge> : <span className={PILL}>{actionLabel}</span>}
              </Link>
            );
          }
          if (key === "mobility_rehab") {
            return (
              <Link key={key} href={`/c/workout/${day.id}`} className={ROW}>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                  <HeartPulse className="size-5" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-snug">
                  <span className="truncate font-semibold">{tToday("mobilityRehab")}</span>
                  <span className="text-sm text-muted-foreground">
                    {t.rich("exercisesOnly", {
                      count: formatNumber(plan.rehabItems.length + plan.mobilityItems.length, locale),
                      num,
                    })}
                  </span>
                </span>
                <Chevron className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            );
          }
          return (
            <div key={key} className="flex flex-col gap-2">
              {plan.activities.map((activity) => (
                <TodayActivityCard key={activity.id} locale={locale} activity={activity} logged={logged.has(activity.id)} />
              ))}
            </div>
          );
        })
      )}

      {sessions.map((session, i) => (
        <Link key={session.id} href={`/c/workout/${session.id}`} className={ROW}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sidebar text-sidebar-foreground">
            <Dumbbell className="size-5" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-snug">
            <span className="truncate font-semibold">{session.label ?? tToday("sessionN", { n: i + 2 })}</span>
            <span className="text-sm text-muted-foreground">
              {t.rich("workoutMeta", {
                exercises: formatNumber(session.exercises, locale),
                sets: formatNumber(session.sets, locale),
                num,
              })}
            </span>
          </span>
          {session.state === "done" ? (
            <Badge variant="success">{t("doneBadge")}</Badge>
          ) : (
            <span className={PILL}>{session.state === "resume" ? t("resume") : t("start")}</span>
          )}
        </Link>
      ))}

      <Link href="/c/diet" className={`${ROW} flex-col items-stretch gap-2`}>
        {nutrition ? (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{tDiet("title")}</span>
              <span className="text-sm text-muted-foreground">
                {nutrition.targetKcal == null
                  ? t("viewPlan")
                  : nutrition.eatenKcal == null
                    ? t.rich("kcalTarget", { target: formatNumber(nutrition.targetKcal, locale), num })
                    : t.rich("kcalProgress", {
                        eaten: formatNumber(Math.round(nutrition.eatenKcal), locale),
                        target: formatNumber(nutrition.targetKcal, locale),
                        num,
                      })}
              </span>
            </span>
            {nutrition.targetKcal != null && nutrition.eatenKcal != null && (
              <Progress
                value={Math.min(100, (nutrition.eatenKcal / nutrition.targetKcal) * 100)}
                aria-label={tDiet("title")}
                className="gap-0 [&_[data-slot=progress-track]]:h-2"
              />
            )}
            {nutrition.targetKcal != null && nutrition.eatenKcal == null && (
              <span className="text-sm text-muted-foreground">{t("kcalNotLogged")}</span>
            )}
            <NextMeal meals={nutrition.meals} heading={t("nextMeal")} fallbackLabel={t("mealFallback")} />
          </>
        ) : (
          <span className="flex flex-col leading-snug">
            <span className="font-semibold">{tDiet("noPlan")}</span>
            <span className="text-sm text-muted-foreground">{tDiet("noPlanBody")}</span>
          </span>
        )}
      </Link>
    </section>
  );
}
