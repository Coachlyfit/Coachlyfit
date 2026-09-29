"use client";

import { useTranslations } from "next-intl";
import { ArrowUpCircle, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { adminSearchFoodsAction } from "./actions";

type Food = Awaited<ReturnType<typeof adminSearchFoodsAction>>["rows"][number];

export function AdminFoodCard({
  food,
  locale,
  onEdit,
  onDelete,
  onPromote,
  variant = "default",
}: {
  food: Food;
  locale: AppLocale;
  onEdit: () => void;
  onDelete: () => void;
  onPromote: () => void;
  variant?: "default" | "compact";
}) {
  const t = useTranslations("library");
  const tFood = useTranslations("library.food");
  const tAdmin = useTranslations("admin.library");
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

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 font-medium">{name}</p>
          <Badge variant={food.coach_id ? "secondary" : "outline"} className="shrink-0">
            {food.coach_id ? tAdmin("coachOwner") : tAdmin("globalOwner")}
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
        <div className="flex justify-end gap-1">
          {food.coach_id ? (
            <Button variant="ghost" size="sm" onClick={onPromote}>
              <ArrowUpCircle className="size-4" />
              {tAdmin("promote")}
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Pencil className="size-4" />
                {tAdmin("edit")}
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
