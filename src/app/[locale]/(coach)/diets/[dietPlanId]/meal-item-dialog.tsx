"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { mealItemSchema, type MealItemFormInput } from "../schemas";
import { addMealItemAction, updateMealItemAction } from "../actions";
import { FoodPicker, type PickedFood } from "./food-picker";

type ExistingItem = {
  id: string;
  food_id: string;
  quantity: number;
  unit: string;
  foods: PickedFood;
};

export function MealItemDialog({
  locale,
  dietPlanId,
  mealId,
  item,
  initialFood,
  open,
  onOpenChange,
}: {
  locale: AppLocale;
  dietPlanId: string;
  mealId: string;
  item?: ExistingItem;
  /** Pre-selects a food on the "add" path -- used by the food sidebar's
   * click-to-add and drag-to-add, same as programs' ItemDialog
   * initialExercise. Ignored when `item` is set. */
  initialFood?: PickedFood;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("diets.itemDialog");
  const tErrors = useTranslations("diets.errors");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedFood, setSelectedFood] = useState(item?.foods ?? initialFood ?? null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<MealItemFormInput>({
    resolver: zodResolver(mealItemSchema),
    defaultValues: item
      ? { food_id: item.food_id, quantity: item.quantity, unit: item.unit }
      : { food_id: initialFood?.id, quantity: 1, unit: "serving" },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("food_id", data.food_id);
    formData.set("quantity", String(data.quantity));
    formData.set("unit", data.unit);

    startTransition(async () => {
      const result = item
        ? await updateMealItemAction(locale, dietPlanId, item.id, formData)
        : await addMealItemAction(locale, dietPlanId, mealId, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      reset();
      setSelectedFood(null);
      onOpenChange(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? t("editTitle") : t("addTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label>{t("food")}</Label>
            <FoodPicker
              locale={locale}
              selectedId={selectedFood?.id ?? null}
              onSelect={(food) => {
                setSelectedFood(food);
                setValue("food_id", food.id, { shouldValidate: true });
              }}
            />
            {selectedFood && (
              <p className="text-sm text-muted-foreground">{pickLocale(selectedFood, locale)}</p>
            )}
            {errors.food_id && <p className="text-sm text-destructive">{errors.food_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="quantity">{t("quantity")}</Label>
              <Input id="quantity" type="number" step="0.1" min={0.1} max={100} {...register("quantity")} />
              {errors.quantity && <p className="text-sm text-destructive">{errors.quantity.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="unit">{t("unit")}</Label>
              <Input id="unit" {...register("unit")} />
              {errors.unit && <p className="text-sm text-destructive">{errors.unit.message}</p>}
            </div>
          </div>

          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending || !selectedFood}>
            {t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
