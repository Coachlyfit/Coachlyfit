"use client";

import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { searchFoodsAction } from "./actions";

type Food = Awaited<ReturnType<typeof searchFoodsAction>>[number];

export function FoodCard({
  food,
  locale,
  onDelete,
}: {
  food: Food;
  locale: AppLocale;
  onDelete: () => void;
}) {
  const t = useTranslations("library");
  const tFood = useTranslations("library.food");

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">{pickLocale(food, locale)}</p>
          <Badge variant={food.coach_id ? "secondary" : "outline"}>
            {food.coach_id ? t("mine") : t("official")}
          </Badge>
        </div>
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
        {food.coach_id && (
          <Button
            variant="ghost"
            size="sm"
            className="self-end text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
            {t("delete")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
