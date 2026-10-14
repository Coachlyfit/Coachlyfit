"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MacroLine, MacroSummary } from "@/components/nutrition/macro-summary";
import { cn } from "@/lib/utils";
import type { MacroTotals } from "@/domain/nutrition/macros";

type Nutrition = { total: MacroTotals; perServing: MacroTotals };

/** Desktop: the sticky card beside the form. */
export function NutritionPanel({ nutrition, servings }: { nutrition: Nutrition; servings: number }) {
  const t = useTranslations("recipes.summary");
  return (
    <Card className="gap-4 px-4" aria-live="polite">
      <h2 className="font-semibold">{t("title")}</h2>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t("perServing")}</p>
        <MacroSummary totals={nutrition.perServing} />
      </div>
      <div className="flex flex-col gap-1 border-t pt-3">
        <p className="text-xs font-medium text-muted-foreground">
          {t("total")} · {t("servings", { count: servings })}
        </p>
        <MacroLine totals={nutrition.total} />
      </div>
    </Card>
  );
}

/** Mobile: a bar pinned above the bottom nav with the per-serving line and
 * the save button; expands to the full summary. */
export function NutritionBar({
  nutrition,
  servings,
  action,
}: {
  nutrition: Nutrition;
  servings: number;
  action: React.ReactNode;
}) {
  const t = useTranslations("recipes.summary");
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky bottom-[var(--bottom-nav-h)] z-30 -mx-4 border-t bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
      {open && (
        <div id="recipe-nutrition-details" className="flex flex-col gap-3 pb-3" aria-live="polite">
          <MacroSummary totals={nutrition.perServing} />
          <p className="text-xs text-muted-foreground">
            {t("total")} · {t("servings", { count: servings })}: <MacroLine totals={nutrition.total} />
          </p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="recipe-nutrition-details"
          aria-label={open ? t("hide") : t("show")}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-start focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronUp className={cn("size-4 shrink-0 transition-transform", !open && "rotate-180")} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">{t("perServing")}</span>
            <MacroLine totals={nutrition.perServing} className="block truncate" />
          </span>
        </button>
        {action}
      </div>
    </div>
  );
}
