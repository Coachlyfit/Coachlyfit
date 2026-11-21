"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Dumbbell, HeartPulse, Moon, StickyNote, Activity, ChefHat, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MacroLine, MacroSummary } from "@/components/nutrition/macro-summary";
import { cn } from "@/lib/utils";
import type { MacroTargets, MacroTotals } from "@/domain/nutrition/macros";
import type { DayKind } from "@/domain/programs/day-plan";
import type { AppLocale } from "@/domain/locale";
import { RecipeSheet, type RecipeView } from "./recipe-sheet";
import { MealLogControls, TodaySummary, type MealMark } from "./meal-logging-ui";

/** One day-type of a plan (Training / Rest / …): its own targets, notes and
 * meals. A plan always has at least one. */
export type PlanDayView = {
  id: string;
  name: string;
  notes: string | null;
  targets: MacroTargets;
  totals: MacroTotals;
  /** Daily water goal in ml (the coach's, else the app default). */
  waterTargetMl: number;
  meals: {
    id: string;
    label: string | null;
    time: string | null;
    totals: MacroTotals;
    items: {
      id: string;
      name: string;
      amount: string;
      kcal: number;
      /** Set for a recipe item; `quantity` is then the servings assigned. */
      recipe: RecipeView | null;
      quantity: number;
    }[];
  }[];
};

export type PlanView = {
  id: string;
  name: string;
  /** Plan-level notes, shared by every day-type. */
  notes: string | null;
  days: PlanDayView[];
};

export type DayView = {
  date: string;
  weekday: string;
  dayNumber: string;
  longLabel: string;
  kind: DayKind | null;
  planId: string | null;
  /** The plan day the weekly schedule picks for this date. */
  dietDayId: string | null;
};

const KIND_ICON = { training: Dumbbell, rest: Moon, cardio: HeartPulse, rehab: Activity } as const;

/** Index of the next meal still ahead today, by the device's clock — read
 * after mount only, so server and first client render agree. Meals without
 * a time can't be "next"; -1 once everything timed has passed. */
function useNextMealIndex(meals: PlanDayView["meals"], enabled: boolean) {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  if (!enabled || now == null) return -1;
  return meals.findIndex((m) => m.time != null && m.time >= now);
}

/** What the client has logged for the first day (today): per-meal marks and
 * water taken so far. */
export type TodayLog = { meals: Record<string, MealMark>; waterMl: number };

export function DietDays({
  locale,
  days,
  plans,
  todayLog,
}: {
  locale: AppLocale;
  days: DayView[];
  plans: Record<string, PlanView>;
  todayLog: TodayLog;
}) {
  const t = useTranslations("client.diet");
  const tRecipe = useTranslations("recipes.item");
  const [selected, setSelected] = useState(0);
  // The day-type the client switched to by hand, for the date being viewed;
  // null = the scheduled one. Reset whenever another date is picked.
  const [pickedDayId, setPickedDayId] = useState<string | null>(null);
  const [openRecipe, setOpenRecipe] = useState<{ recipe: RecipeView; servings: number } | null>(null);
  const day = days[selected];
  const plan = day.planId ? plans[day.planId] : null;
  const planDay = plan ? (plan.days.find((d) => d.id === (pickedDayId ?? day.dietDayId)) ?? plan.days[0] ?? null) : null;
  const nextIndex = useNextMealIndex(planDay?.meals ?? [], selected === 0);
  // Only worth a label when the week actually alternates between plans.
  const variesByDay = new Set(days.map((d) => d.planId)).size > 1;
  // Logging is for today only (the first day of the strip).
  const isToday = selected === 0;

  return (
    <div className="flex flex-col gap-4">
      {isToday && planDay && (
        <TodaySummary
          locale={locale}
          date={day.date}
          done={planDay.meals.filter((m) => todayLog.meals[m.id]?.status === "eaten").length}
          total={planDay.meals.length}
          waterMl={todayLog.waterMl}
          waterTargetMl={planDay.waterTargetMl}
        />
      )}

      {days.length > 1 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist">
          {days.map((d, i) => {
            const Icon = d.kind ? KIND_ICON[d.kind] : null;
            const active = i === selected;
            return (
              <button
                key={d.date}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setSelected(i);
                  setPickedDayId(null);
                }}
                className={cn(
                  "flex min-w-12 flex-1 flex-col items-center gap-0.5 rounded-xl border px-1 py-2 transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"
                )}
              >
                <span className={cn("text-[10px]", !active && "text-muted-foreground")}>
                  {i === 0 ? t("today") : d.weekday}
                </span>
                <span className="font-mono text-base font-semibold tabular-nums">{d.dayNumber}</span>
                {Icon ? (
                  <Icon className={cn("size-3.5", !active && "text-muted-foreground")} aria-label={t(`kind.${d.kind}`)} />
                ) : (
                  <span className="size-3.5" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <Card className="gap-3 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{selected === 0 ? t("today") : day.longLabel}</p>
          {day.kind && <Badge variant="secondary">{t(`kind.${day.kind}`)}</Badge>}
          {plan && variesByDay && <span className="text-xs text-muted-foreground">{plan.name}</span>}
        </div>
        {plan && plan.days.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("dayType")}>
            {plan.days.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={d.id === planDay?.id}
                onClick={() => setPickedDayId(d.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  d.id === planDay?.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted"
                )}
              >
                {d.name}
              </button>
            ))}
          </div>
        )}
        {planDay ? (
          <MacroSummary totals={planDay.totals} targets={planDay.targets} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("noMealsForDay")}</p>
        )}
      </Card>

      {[plan?.notes, planDay?.notes].map(
        (note) =>
          note && (
            <div key={note} className="flex items-start gap-2 rounded-xl bg-muted/60 px-4 py-3 text-sm">
              <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="whitespace-pre-line">{note}</p>
            </div>
          )
      )}

      {planDay && (
        <ol className="flex flex-col gap-3">
          {planDay.meals.map((meal, i) => {
            const isNext = i === nextIndex;
            const past = selected === 0 && nextIndex !== -1 && meal.time != null && i < nextIndex;
            return (
              <li key={meal.id}>
                <Card className={cn("gap-2 px-4", isNext && "ring-2 ring-primary", past && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate font-semibold">{meal.label ?? t("mealN", { n: i + 1 })}</h2>
                        {isNext && <Badge>{t("next")}</Badge>}
                      </div>
                      <MacroLine totals={meal.totals} />
                    </div>
                    {meal.time && (
                      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{meal.time}</span>
                    )}
                  </div>
                  {meal.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">—</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-border">
                      {meal.items.map((item) =>
                        item.recipe ? (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => item.recipe && setOpenRecipe({ recipe: item.recipe, servings: item.quantity })}
                              className="flex w-full items-center gap-3 rounded-md py-2 text-start text-sm hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span className="w-20 shrink-0 break-words font-mono text-sm font-semibold tabular-nums">
                                {item.amount}
                              </span>
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="flex items-center gap-1.5">
                                  <ChefHat className="size-4 shrink-0 text-primary" aria-label={tRecipe("recipe")} />
                                  <span className="min-w-0">{item.name}</span>
                                </span>
                                <span className="text-xs text-primary">{tRecipe("view")}</span>
                              </span>
                              <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                                {t("kcal", { n: item.kcal })}
                              </span>
                              <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
                            </button>
                          </li>
                        ) : (
                          <li key={item.id} className="flex items-center gap-3 py-2 text-sm">
                            <span className="w-20 shrink-0 break-words font-mono text-sm font-semibold tabular-nums">
                              {item.amount}
                            </span>
                            <span className="min-w-0 flex-1">{item.name}</span>
                            <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                              {t("kcal", { n: item.kcal })}
                            </span>
                          </li>
                        )
                      )}
                    </ul>
                  )}
                  {isToday && (
                    <MealLogControls
                      // Remount when the saved mark changes so the note box resets to it.
                      key={`${meal.id}:${todayLog.meals[meal.id]?.status ?? ""}:${todayLog.meals[meal.id]?.note ?? ""}`}
                      locale={locale}
                      date={day.date}
                      mealId={meal.id}
                      mark={todayLog.meals[meal.id] ?? null}
                    />
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      {openRecipe && (
        <RecipeSheet
          key={openRecipe.recipe.id}
          recipe={openRecipe.recipe}
          assignedServings={openRecipe.servings}
          open
          onOpenChange={(open) => !open && setOpenRecipe(null)}
        />
      )}
    </div>
  );
}
