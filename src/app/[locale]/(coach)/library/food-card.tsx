"use client";

import { useTranslations } from "next-intl";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { macroPercentages } from "@/domain/nutrition/macros";
import type { searchFoodsAction } from "./actions";

type Food = Awaited<ReturnType<typeof searchFoodsAction>>["rows"][number];

// Same macro → chart colour pairing as MacroSummary (components/nutrition),
// so protein is the same colour here as in a diet plan.
export const FOOD_MACROS = [
  { key: "protein", field: "protein_g", percent: "proteinPercent", color: "bg-chart-1" },
  { key: "carbs", field: "carb_g", percent: "carbPercent", color: "bg-chart-2" },
  { key: "fat", field: "fat_g", percent: "fatPercent", color: "bg-chart-3" },
] as const;

export function FoodCard({
  food,
  locale,
  onDelete,
  onClone,
  onEdit,
  onEditMyClone,
  variant = "default",
}: {
  food: Food;
  locale: AppLocale;
  onDelete: () => void;
  /** Global card, not yet cloned. */
  onClone: () => void;
  /** The coach's own row (a clone or a plain private addition). */
  onEdit: () => void;
  /** Global card the coach already cloned — see exercise-card.tsx's version
   * of this prop for why the parent re-fetches before opening the dialog. */
  onEditMyClone: () => void;
  /** "compact" drops macros and actions — used for kanban cards. */
  variant?: "default" | "compact";
}) {
  const t = useTranslations("library");
  const tFood = useTranslations("library.food");
  const tColumns = useTranslations("library.columns");
  const tCategories = useTranslations("library.foodCategories");
  const name = pickLocale(food, locale);

  if (variant === "compact") {
    return (
      <Card size="sm">
        <CardContent className="flex flex-col gap-0.5 p-2.5">
          <p className="line-clamp-2 text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">
            {food.serving_label} · {food.kcal} {tFood("kcal")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const shares = macroPercentages(food);

  return (
    <Card className="py-0">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-semibold">{name}</h3>
          <Badge variant="secondary" className="rounded-md">
            {tCategories(food.category)}
          </Badge>
        </div>
        {food.coach_id && <Badge variant="warning">{t("mineBadge.foods")}</Badge>}
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-semibold tabular-nums">{food.kcal}</span>
          <span className="text-sm text-muted-foreground">
            {t.rich("preview.kcalPerServing", {
              serving: food.serving_label,
              // serving_label is one untranslated string ("1 serving"); isolate
              // it so its digits don't get reordered inside Arabic text.
              bdi: (chunks) => <bdi>{chunks}</bdi>,
            })}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          {FOOD_MACROS.map(({ key, field, percent, color }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-14 shrink-0 truncate">{tColumns(key)}</span>
              <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span className={`h-full rounded-full ${color}`} style={{ width: `${shares[percent]}%` }} />
              </span>
              <span className="w-13 shrink-0 text-end font-mono tabular-nums">{food[field]}g</span>
            </div>
          ))}
        </div>
        <div className="mt-auto flex justify-end gap-1">
          {!food.coach_id ? (
            food.my_clone_id ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t("editMyVersion")}: ${name}`}
                title={t("editMyVersion")}
                onClick={onEditMyClone}
              >
                <Pencil className="size-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t("preview.duplicateAndEdit")}: ${name}`}
                title={t("preview.duplicateAndEdit")}
                onClick={onClone}
              >
                <Copy className="size-4" />
              </Button>
            )
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t("edit")}: ${name}`}
                title={t("edit")}
                onClick={onEdit}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                aria-label={`${t("delete")}: ${name}`}
                title={t("delete")}
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
