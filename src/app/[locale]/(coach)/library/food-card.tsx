"use client";

import { useTranslations } from "next-intl";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { searchFoodsAction } from "./actions";

type Food = Awaited<ReturnType<typeof searchFoodsAction>>["rows"][number];

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
  // See exercise-card.tsx: a promoted clone keeps source_food_id but has no
  // owning coach left, so it reads as Official rather than Customized.
  const isCustomized = !!food.coach_id && !!food.source_food_id;
  const badgeLabel = !food.coach_id ? t("official") : isCustomized ? t("customized") : t("mine");

  if (variant === "compact") {
    return (
      <Card size="sm">
        <CardContent className="flex flex-col gap-0.5 p-2.5">
          <p className="line-clamp-2 text-sm font-medium">{pickLocale(food, locale)}</p>
          <p className="text-xs text-muted-foreground">
            {food.serving_label} · {food.kcal} {tFood("kcal")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 font-medium">{pickLocale(food, locale)}</p>
          <Badge variant={food.coach_id ? "secondary" : "outline"} className="shrink-0">
            {badgeLabel}
          </Badge>
        </div>
        {isCustomized && (
          <p className="text-xs text-muted-foreground">
            {t("basedOn", { name: pickLocale(food, locale, "source_name") })}
          </p>
        )}
        <p className="text-sm text-muted-foreground">{food.serving_label}</p>
        <div className="grid grid-cols-4 gap-2 text-center text-xs tabular-nums">
          <div>
            <p className="font-medium">{food.kcal}</p>
            <p className="text-muted-foreground">{tFood("kcal")}</p>
          </div>
          <div>
            <p className="font-medium">{food.protein_g}</p>
            <p className="text-muted-foreground">{tFood("protein")}</p>
          </div>
          <div>
            <p className="font-medium">{food.carb_g}</p>
            <p className="text-muted-foreground">{tFood("carbs")}</p>
          </div>
          <div>
            <p className="font-medium">{food.fat_g}</p>
            <p className="text-muted-foreground">{tFood("fat")}</p>
          </div>
        </div>
        <div className="flex justify-end gap-1">
          {!food.coach_id ? (
            food.my_clone_id ? (
              <Button variant="ghost" size="sm" onClick={onEditMyClone}>
                <Pencil className="size-4" />
                {t("editMyVersion")}
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onClone}>
                <Copy className="size-4" />
                {t("clone")}
              </Button>
            )
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Pencil className="size-4" />
                {t("edit")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
                {t("delete")}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
