"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { ChefHat, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { mealVisual, type MealTone } from "@/domain/nutrition/meal-visual";
import type { PlanDayView } from "./diet-days";
import type { RecipeView } from "./recipe-sheet";
import { MealActions, type MealMark } from "./meal-logging-ui";

const TONE: Record<MealTone, string> = {
  orange: "bg-nutri-orange/12",
  blue: "bg-nutri-blue/10",
  purple: "bg-nutri-purple/10",
};

/** One meal as a collapsible card: icon, name, time and kcal while closed;
 * foods, macro tags and (for today) the Done / Skip / note row once opened.
 * Done turns the border green and shows a check by the name; skipped dims
 * the whole card. */
export function MealCard({
  locale,
  date,
  index,
  meal,
  isToday,
  mark,
  isNext,
  past,
  onMark,
  onOpenRecipe,
}: {
  locale: AppLocale;
  date: string;
  index: number;
  meal: PlanDayView["meals"][number];
  isToday: boolean;
  mark: MealMark | null;
  isNext: boolean;
  past: boolean;
  onMark: (mark: MealMark | null) => void;
  onOpenRecipe: (recipe: RecipeView, servings: number) => void;
}) {
  const t = useTranslations("client.diet");
  const tLog = useTranslations("client.diet.log");
  const tMacros = useTranslations("diets.macros");
  const tRecipe = useTranslations("recipes.item");
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const name = meal.label ?? t("mealN", { n: index + 1 });
  const visual = mealVisual(meal.time, index);
  const status = isToday ? (mark?.status ?? null) : null;
  const grams = (n: number) => tLog("grams", { n: formatNumber(Math.round(n), locale) });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card transition-colors",
        status === "eaten" && "border-nutri-green/30",
        status === "skipped" && "opacity-50",
        !status && past && "opacity-60",
        isNext && "ring-2 ring-primary"
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-start focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            className={cn("flex size-10 shrink-0 items-center justify-center rounded-[10px] text-lg", TONE[visual.tone])}
            aria-hidden
          >
            {visual.emoji}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold">{name}</span>
              {status === "eaten" && <span className="shrink-0 text-xs font-semibold text-nutri-green">✓ {tLog("done")}</span>}
              {isNext && !status && <Badge>{t("next")}</Badge>}
            </span>
            {meal.time && <span className="block font-mono text-xs tabular-nums text-muted-foreground">{meal.time}</span>}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          {!open && (
            <span className="font-mono text-sm font-medium tabular-nums text-muted-foreground">
              {t("kcal", { n: Math.round(meal.totals.kcal) })}
            </span>
          )}
          {isToday && (
            <span
              className={cn(
                "size-2 rounded-full",
                status === "eaten" ? "bg-nutri-green shadow-[0_0_6px_var(--color-nutri-green)]" : "bg-muted-foreground/30"
              )}
              aria-hidden
            />
          )}
          <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform duration-300", open && "rotate-180")} aria-hidden />
        </span>
      </button>

      <div
        id={panelId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border px-4 pt-2.5">
            {meal.items.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="flex flex-col">
                {meal.items.map((item) => {
                  const body = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[13px]">
                          {item.recipe && <ChefHat className="size-4 shrink-0 text-primary" aria-label={tRecipe("recipe")} />}
                          <span className="min-w-0">{item.name}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{item.amount}</span>
                        {item.recipe && <span className="text-xs text-primary">{tRecipe("view")}</span>}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        {t("kcal", { n: item.kcal })}
                      </span>
                      {item.recipe && (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden />
                      )}
                    </>
                  );
                  return (
                    <li key={item.id} className="border-b border-border/60 last:border-b-0">
                      {item.recipe ? (
                        <button
                          type="button"
                          onClick={() => item.recipe && onOpenRecipe(item.recipe, item.quantity)}
                          className="flex w-full items-center gap-3 rounded-md py-2 text-start hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="flex items-center gap-3 py-2">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex flex-wrap gap-1.5 border-t border-border py-2.5">
              <span className="rounded-full bg-nutri-orange/15 px-2 py-0.5 font-mono text-[11px] font-medium text-nutri-orange">
                {tMacros("p")} {grams(meal.totals.protein_g)}
              </span>
              <span className="rounded-full bg-nutri-blue/15 px-2 py-0.5 font-mono text-[11px] font-medium text-nutri-blue">
                {tMacros("c")} {grams(meal.totals.carb_g)}
              </span>
              <span className="rounded-full bg-nutri-purple/15 px-2 py-0.5 font-mono text-[11px] font-medium text-nutri-purple">
                {tMacros("f")} {grams(meal.totals.fat_g)}
              </span>
            </div>
          </div>

          {isToday && <MealActions locale={locale} date={date} mealId={meal.id} mealName={name} mark={mark} onMark={onMark} />}
        </div>
      </div>
    </div>
  );
}
