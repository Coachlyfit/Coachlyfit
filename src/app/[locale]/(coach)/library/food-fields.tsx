"use client";

import { Controller, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FOOD_CATEGORIES } from "@/domain/library/taxonomy";
import type { CreateFoodFormInput } from "./schemas";

/** The food form fields, shared by the coach's create/clone/edit dialog
 * (food-dialog.tsx). See exercise-fields.tsx for why this is pulled out and
 * what idPrefix is for. */
export function FoodFields({
  idPrefix = "",
  register,
  control,
  errors,
}: {
  idPrefix?: string;
  register: UseFormRegister<CreateFoodFormInput>;
  control: Control<CreateFoodFormInput>;
  errors: FieldErrors<CreateFoodFormInput>;
}) {
  const t = useTranslations("library.food");
  const tCategories = useTranslations("library.foodCategories");
  const id = (name: string) => `${idPrefix}${name}`;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("name_ar")}>{t("nameAr")}</Label>
          <Input id={id("name_ar")} dir="rtl" {...register("name_ar")} />
          {errors.name_ar && <p className="text-sm text-destructive">{errors.name_ar.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("name_en")}>{t("nameEn")}</Label>
          <Input id={id("name_en")} dir="ltr" {...register("name_en")} />
          {errors.name_en && <p className="text-sm text-destructive">{errors.name_en.message}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("serving_label")}>{t("servingLabel")}</Label>
          <Input id={id("serving_label")} placeholder="100g" {...register("serving_label")} />
          {errors.serving_label && (
            <p className="text-sm text-destructive">{errors.serving_label.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("category")}>{t("category")}</Label>
          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={id("category")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOOD_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {tCategories(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("kcal")}>{t("kcal")}</Label>
          <Input id={id("kcal")} type="number" step="1" {...register("kcal")} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("protein_g")}>{t("protein")}</Label>
          <Input id={id("protein_g")} type="number" step="0.1" {...register("protein_g")} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("carb_g")}>{t("carbs")}</Label>
          <Input id={id("carb_g")} type="number" step="0.1" {...register("carb_g")} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("fat_g")}>{t("fat")}</Label>
          <Input id={id("fat_g")} type="number" step="0.1" {...register("fat_g")} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("notes_ar")}>{t("notesAr")}</Label>
        <Textarea id={id("notes_ar")} dir="rtl" rows={2} {...register("notes_ar")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("notes_en")}>{t("notesEn")}</Label>
        <Textarea id={id("notes_en")} dir="ltr" rows={2} {...register("notes_en")} />
      </div>
    </>
  );
}
