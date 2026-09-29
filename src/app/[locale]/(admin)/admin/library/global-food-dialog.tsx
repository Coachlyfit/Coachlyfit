"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  createFoodSchema,
  type CreateFoodFormInput,
  type CreateFoodInput,
} from "@/app/[locale]/(coach)/library/schemas";
import { FoodFields } from "@/app/[locale]/(coach)/library/food-fields";
import {
  type adminSearchFoodsAction,
  createGlobalFoodAction,
  updateGlobalFoodAction,
} from "./actions";

type ExistingFood = Awaited<ReturnType<typeof adminSearchFoodsAction>>["rows"][number];

/** Food counterpart of GlobalExerciseDialog: create and edit share one form,
 * `food` present = edit mode. */
export function GlobalFoodDialog({
  locale,
  food,
  open,
  onOpenChange,
  onSaved,
}: {
  locale: string;
  food?: ExistingFood;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("library.food");
  const tAdmin = useTranslations("admin.library");
  const tErrors = useTranslations("library.errors");
  const tCommon = useTranslations("common");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const isEdit = !!food;
  const isOpen = open ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateFoodFormInput, unknown, CreateFoodInput>({
    resolver: zodResolver(createFoodSchema),
    defaultValues: {
      name_ar: food?.name_ar ?? "",
      name_en: food?.name_en ?? "",
      serving_label: food?.serving_label ?? "",
      category: (food?.category as CreateFoodFormInput["category"]) ?? "other",
      kcal: food?.kcal ?? 0,
      protein_g: food?.protein_g ?? 0,
      carb_g: food?.carb_g ?? 0,
      fat_g: food?.fat_g ?? 0,
      notes_ar: food?.notes_ar ?? "",
      notes_en: food?.notes_en ?? "",
    },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== "") formData.set(key, String(value));
    }
    startTransition(async () => {
      const result = isEdit
        ? await updateGlobalFoodAction(locale, food.id, formData)
        : await createGlobalFoodAction(locale, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      if (!isEdit) reset();
      setOpen(false);
      onSaved();
    });
  });

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {!isEdit && (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus className="size-4" />
          {tAdmin("addGlobalFood")}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? tAdmin("editGlobal") : tAdmin("addGlobalFood")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <FoodFields idPrefix="gf_" register={register} control={control} errors={errors} />
          {formError && (
            <p className="text-sm text-destructive">
              {tErrors.has(formError) ? tErrors(formError) : tErrors("unknown")}
            </p>
          )}
          <Button type="submit" disabled={pending} className="min-w-24">
            {pending ? tCommon("pending") : isEdit ? tAdmin("edit") : t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
