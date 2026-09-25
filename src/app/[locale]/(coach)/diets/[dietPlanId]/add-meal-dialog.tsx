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
import { mealSchema, type MealFormInput } from "../schemas";
import { addMealAction, updateMealAction } from "../actions";

type ExistingMeal = { id: string; label_ar: string | null; label_en: string | null; time_of_day: string | null };

export function AddMealDialog({
  locale,
  dietPlanId,
  meal,
  open,
  onOpenChange,
}: {
  locale: string;
  dietPlanId: string;
  meal?: ExistingMeal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("diets.mealDialog");
  const tErrors = useTranslations("diets.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MealFormInput>({
    resolver: zodResolver(mealSchema),
    defaultValues: meal
      ? { label_ar: meal.label_ar ?? "", label_en: meal.label_en ?? "", time_of_day: meal.time_of_day ?? "" }
      : {},
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    if (data.label_ar) formData.set("label_ar", data.label_ar);
    if (data.label_en) formData.set("label_en", data.label_en);
    if (data.time_of_day) formData.set("time_of_day", data.time_of_day);

    startTransition(async () => {
      const result = meal
        ? await updateMealAction(locale, dietPlanId, meal.id, formData)
        : await addMealAction(locale, dietPlanId, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      reset();
      onOpenChange(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{meal ? t("editTitle") : t("addTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="label_ar">{t("labelAr")}</Label>
            <Input id="label_ar" dir="rtl" {...register("label_ar")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="label_en">{t("labelEn")}</Label>
            <Input id="label_en" dir="ltr" {...register("label_en")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="time_of_day">{t("timeOfDay")}</Label>
            <Input id="time_of_day" type="time" {...register("time_of_day")} />
          </div>
          {errors.label_ar && <p className="text-sm text-destructive">{errors.label_ar.message}</p>}
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending} className="min-w-24">
            {pending ? tCommon("pending") : t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
