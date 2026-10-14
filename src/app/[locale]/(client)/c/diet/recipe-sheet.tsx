"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChefHat, Clock, Minus, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { VideoPreview } from "@/components/recipes/video-preview";
import { cn } from "@/lib/utils";
import { formatIngredientAmount } from "@/domain/recipes/recipe-nutrition";
import type { MacroTotals } from "@/domain/nutrition/macros";

export type RecipeView = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  /** How many servings the recipe's ingredient amounts make. */
  recipeServings: number;
  perServing: MacroTotals;
  ingredients: { id: string; name: string; quantity: number; unit: string; servingLabel: string | null; note: string | null }[];
  steps: string[];
  videoUrl: string | null;
};

const MACRO_CHIPS = [
  { key: "protein", field: "protein_g", color: "bg-chart-1" },
  { key: "carbs", field: "carb_g", color: "bg-chart-2" },
  { key: "fat", field: "fat_g", color: "bg-chart-3" },
] as const;

/** Keeps the screen on while cooking mode is on. Hidden where the Wake Lock
 * API isn't available; the lock is re-taken when the tab becomes visible
 * again, since the browser drops it on hide. */
function useWakeLock(enabled: boolean) {
  const lock = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) void sentinel.release();
        else lock.current = sentinel;
      } catch {
        // Denied (battery saver, unfocused tab): cooking still works, the screen may just dim.
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock.current?.release();
      lock.current = null;
    };
  }, [enabled]);
}

/** Read-only recipe for the client: macros per serving, ingredients scaled
 * to the servings the coach assigned (the scaler only changes what's shown,
 * never the plan), tick-off checkboxes, numbered steps and the video. */
export function RecipeSheet({
  recipe,
  assignedServings,
  open,
  onOpenChange,
}: {
  recipe: RecipeView;
  assignedServings: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("recipes.detail");
  const tMacros = useTranslations("diets.macros");
  const [servings, setServings] = useState(assignedServings);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [cooking, setCooking] = useState(false);
  // Only ever mounted after a tap (DietDays renders it on demand), so
  // reading navigator here can't cause a hydration mismatch.
  const [wakeLockSupported] = useState(() => typeof navigator !== "undefined" && "wakeLock" in navigator);
  useWakeLock(open && cooking);

  const scale = servings / recipe.recipeServings;
  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 p-0">
        <div className="relative aspect-video w-full shrink-0 bg-muted">
          {recipe.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
            <img src={recipe.imageUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center">
              <ChefHat className="size-12 text-muted-foreground/50" aria-hidden="true" />
            </span>
          )}
        </div>

        <div className="flex flex-col gap-5 p-4">
          <SheetHeader className="gap-1 p-0">
            <SheetTitle className="text-xl">{recipe.name}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{t("assigned", { count: assignedServings })}</span>
              {totalMinutes > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden="true" />
                  {t("totalTime", { count: totalMinutes })}
                  {recipe.prepMinutes != null && recipe.cookMinutes != null && (
                    <span className="text-xs">
                      ({t("prep", { count: recipe.prepMinutes })} · {t("cook", { count: recipe.cookMinutes })})
                    </span>
                  )}
                </span>
              )}
            </SheetDescription>
            {recipe.description && <p className="text-sm text-muted-foreground">{recipe.description}</p>}
          </SheetHeader>

          <section aria-label={t("perServing")} className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">{t("perServing")}</p>
            <div className="grid grid-cols-4 gap-2">
              <div className="flex flex-col items-center rounded-xl bg-primary/10 px-2 py-2.5">
                <span className="font-mono text-xl font-semibold tabular-nums">{Math.round(recipe.perServing.kcal)}</span>
                <span className="text-xs text-muted-foreground">{tMacros("kcal")}</span>
              </div>
              {MACRO_CHIPS.map(({ key, field, color }) => (
                <div key={key} className="flex flex-col items-center rounded-xl bg-muted px-2 py-2.5">
                  <span className="font-mono text-xl font-semibold tabular-nums">
                    {Math.round(recipe.perServing[field])}
                    <span className="text-sm font-normal text-muted-foreground">g</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className={cn("size-1.5 rounded-full", color)} aria-hidden="true" />
                    {tMacros(key)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="recipe-sheet-ingredients" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="recipe-sheet-ingredients" className="text-base font-semibold">
                {t("ingredients")}
              </h3>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">{t("cookingFor")}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setServings((s) => Math.max(0.5, s - 0.5))}
                  disabled={servings <= 0.5}
                  aria-label={t("fewer")}
                >
                  <Minus className="size-4" />
                </Button>
                <span className="w-8 text-center font-mono font-semibold tabular-nums" aria-live="polite">
                  {servings}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setServings((s) => Math.min(40, s + 0.5))}
                  aria-label={t("more")}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
            {servings !== assignedServings && <p className="text-xs text-muted-foreground">{t("scaleHint")}</p>}
            <ul className="flex flex-col divide-y divide-border">
              {recipe.ingredients.map((ingredient) => {
                const id = `ingredient-${recipe.id}-${ingredient.id}`;
                const done = checked.has(ingredient.id);
                return (
                  <li key={ingredient.id} className="flex items-center gap-3 py-2.5">
                    <Checkbox
                      id={id}
                      checked={done}
                      onCheckedChange={(value) =>
                        setChecked((prev) => {
                          const next = new Set(prev);
                          if (value) next.add(ingredient.id);
                          else next.delete(ingredient.id);
                          return next;
                        })
                      }
                    />
                    <label htmlFor={id} className={cn("flex min-w-0 flex-1 gap-3 text-base", done && "text-muted-foreground line-through")}>
                      <span className="w-20 shrink-0 font-mono font-semibold tabular-nums">
                        {formatIngredientAmount(ingredient.quantity, ingredient.unit, ingredient.servingLabel, scale)}
                      </span>
                      <span className="min-w-0">
                        {ingredient.name}
                        {ingredient.note && <span className="text-sm text-muted-foreground"> · {ingredient.note}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="recipe-sheet-steps" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="recipe-sheet-steps" className="text-base font-semibold">
                {t("steps")}
              </h3>
              {wakeLockSupported && recipe.steps.length > 0 && (
                <label className="flex items-center gap-2 text-sm" title={t("cookingModeHint")}>
                  <Switch checked={cooking} onCheckedChange={setCooking} aria-describedby="cooking-mode-hint" />
                  {t("cookingMode")}
                  <span id="cooking-mode-hint" className="sr-only">
                    {t("cookingModeHint")}
                  </span>
                </label>
              )}
            </div>
            {recipe.steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noSteps")}</p>
            ) : (
              <ol className="flex flex-col gap-4">
                {recipe.steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-semibold text-primary tabular-nums">
                      {i + 1}
                    </span>
                    <p className="pt-0.5 text-base leading-relaxed whitespace-pre-line">{step}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {recipe.videoUrl && (
            <section aria-label={t("watch")} className="flex flex-col gap-2">
              <h3 className="text-base font-semibold">{t("watch")}</h3>
              <VideoPreview url={recipe.videoUrl} />
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
