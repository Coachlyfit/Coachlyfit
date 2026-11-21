"use client";

import { useEffect, useOptimistic, useState } from "react";
import { useTranslations } from "next-intl";
import { Dumbbell, HeartPulse, Moon, StickyNote, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MacroTargets, MacroTotals } from "@/domain/nutrition/macros";
import type { DayKind } from "@/domain/programs/day-plan";
import type { AppLocale } from "@/domain/locale";
import { WATER_CUP_ML } from "@/domain/nutrition/meal-logging";
import { RecipeSheet, type RecipeView } from "./recipe-sheet";
import { ProgressStrip, WaterCard, type MealMark } from "./meal-logging-ui";
import { DailyHeader } from "./daily-header";
import { MealCard } from "./meal-card";

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

type LogPatch = { type: "meal"; id: string; mark: MealMark | null } | { type: "water"; cups: number };

function applyPatch(state: TodayLog, patch: LogPatch): TodayLog {
  if (patch.type === "water") return { ...state, waterMl: patch.cups * WATER_CUP_ML };
  const meals = { ...state.meals };
  if (patch.mark) meals[patch.id] = patch.mark;
  else delete meals[patch.id];
  return { ...state, meals };
}

export function DietDays({
  locale,
  days,
  plans,
  todayLog,
  logPanel,
}: {
  locale: AppLocale;
  days: DayView[];
  plans: Record<string, PlanView>;
  todayLog: TodayLog;
  /** The manual intake log, shown under the meals and water. */
  logPanel: React.ReactNode;
}) {
  const t = useTranslations("client.diet");
  const tLog = useTranslations("client.diet.log");
  const [selected, setSelected] = useState(0);
  // The day-type the client switched to by hand, for the date being viewed;
  // null = the scheduled one. Reset whenever another date is picked.
  const [pickedDayId, setPickedDayId] = useState<string | null>(null);
  const [openRecipe, setOpenRecipe] = useState<{ recipe: RecipeView; servings: number } | null>(null);
  // Marks and water show at once and settle to the server's data when the
  // action finishes (or snap back if it failed).
  const [log, patchLog] = useOptimistic(todayLog, applyPatch);
  const day = days[selected];
  const plan = day.planId ? plans[day.planId] : null;
  const planDay = plan ? (plan.days.find((d) => d.id === (pickedDayId ?? day.dietDayId)) ?? plan.days[0] ?? null) : null;
  const nextIndex = useNextMealIndex(planDay?.meals ?? [], selected === 0);
  // Only worth a label when the week actually alternates between plans.
  const variesByDay = new Set(days.map((d) => d.planId)).size > 1;
  // Logging is for today only (the first day of the strip).
  const isToday = selected === 0;

  // Today shows what's been eaten so far; any other day shows the plan's totals.
  const shownTotals: MacroTotals | null = planDay
    ? isToday
      ? planDay.meals
          .filter((m) => log.meals[m.id]?.status === "eaten")
          .reduce<MacroTotals>(
            (sum, m) => ({
              kcal: sum.kcal + m.totals.kcal,
              protein_g: sum.protein_g + m.totals.protein_g,
              carb_g: sum.carb_g + m.totals.carb_g,
              fat_g: sum.fat_g + m.totals.fat_g,
            }),
            { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 }
          )
      : planDay.totals
    : null;

  return (
    <div className="flex flex-col gap-4">
      {planDay && shownTotals && (
        <DailyHeader
          locale={locale}
          dateLabel={day.longLabel}
          isToday={isToday}
          totals={shownTotals}
          targets={planDay.targets}
        />
      )}

      {isToday && planDay && (
        <ProgressStrip
          locale={locale}
          done={planDay.meals.filter((m) => log.meals[m.id]?.status === "eaten").length}
          total={planDay.meals.length}
          waterMl={log.waterMl}
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

      {(day.kind || (plan && variesByDay) || (plan && plan.days.length > 1) || !planDay) && (
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
          {!planDay && <p className="text-sm text-muted-foreground">{t("noMealsForDay")}</p>}
        </Card>
      )}

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
        <section className="flex flex-col gap-3" aria-labelledby="meals-heading">
          <h2 id="meals-heading" className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {tLog("mealsHeading")}
          </h2>
          <ol className="flex flex-col gap-3">
            {planDay.meals.map((meal, i) => (
              <li key={meal.id}>
                <MealCard
                  locale={locale}
                  date={day.date}
                  index={i}
                  meal={meal}
                  isToday={isToday}
                  mark={log.meals[meal.id] ?? null}
                  isNext={i === nextIndex}
                  past={isToday && nextIndex !== -1 && meal.time != null && i < nextIndex}
                  onMark={(mark) => patchLog({ type: "meal", id: meal.id, mark })}
                  onOpenRecipe={(recipe, servings) => setOpenRecipe({ recipe, servings })}
                />
              </li>
            ))}
          </ol>
        </section>
      )}

      {isToday && planDay && (
        <WaterCard
          locale={locale}
          date={day.date}
          waterMl={log.waterMl}
          waterTargetMl={planDay.waterTargetMl}
          onCups={(cups) => patchLog({ type: "water", cups })}
        />
      )}

      {logPanel}

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
