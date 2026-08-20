"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FOOD_CATEGORIES } from "@/domain/library/taxonomy";
import { createFoodSchema, type CreateFoodFormInput, type CreateFoodInput } from "./schemas";
import { createFoodAction } from "./actions";

export function AddFoodDialog({ locale, onCreated }: { locale: string; onCreated: () => void }) {
  const t = useTranslations("library.food");
  const tCategories = useTranslations("library.foodCategories");
  const tErrors = useTranslations("library.errors");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateFoodFormInput, unknown, CreateFoodInput>({
    resolver: zodResolver(createFoodSchema),
    defaultValues: { category: "other" },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("name_ar", data.name_ar);
    formData.set("name_en", data.name_en);
    formData.set("serving_label", data.serving_label);
    formData.set("category", data.category);
    formData.set("kcal", String(data.kcal));
    formData.set("protein_g", String(data.protein_g));
    formData.set("carb_g", String(data.carb_g));
    formData.set("fat_g", String(data.fat_g));
    startTransition(async () => {
      const result = await createFoodAction(locale, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      reset();
      setOpen(false);
      onCreated();
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        {t("add")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("add")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name_ar">{t("nameAr")}</Label>
              <Input id="name_ar" dir="rtl" {...register("name_ar")} />
              {errors.name_ar && <p className="text-sm text-destructive">{errors.name_ar.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name_en">{t("nameEn")}</Label>
              <Input id="name_en" dir="ltr" {...register("name_en")} />
              {errors.name_en && <p className="text-sm text-destructive">{errors.name_en.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="serving_label">{t("servingLabel")}</Label>
              <Input id="serving_label" placeholder="100g" {...register("serving_label")} />
              {errors.serving_label && (
                <p className="text-sm text-destructive">{errors.serving_label.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="category">{t("category")}</Label>
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="category">
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
              <Label htmlFor="kcal">{t("kcal")}</Label>
              <Input id="kcal" type="number" step="1" {...register("kcal")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="protein_g">{t("protein")}</Label>
              <Input id="protein_g" type="number" step="0.1" {...register("protein_g")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="carb_g">{t("carbs")}</Label>
              <Input id="carb_g" type="number" step="0.1" {...register("carb_g")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="fat_g">{t("fat")}</Label>
              <Input id="fat_g" type="number" step="0.1" {...register("fat_g")} />
            </div>
          </div>
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending}>
            {t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
