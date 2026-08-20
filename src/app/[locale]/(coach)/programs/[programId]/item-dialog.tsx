"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AppLocale } from "@/domain/locale";
import { itemSchema, type ItemFormInput } from "../schemas";
import { addItemAction, updateItemAction } from "../actions";
import { ExercisePicker } from "./exercise-picker";

type ExistingItem = {
  id: string;
  exercise_id: string;
  sets: number;
  reps: string;
  rest_seconds: number | null;
  notes_ar: string | null;
  notes_en: string | null;
  exercises: { id: string; name_ar: string; name_en: string };
};

export function ItemDialog({
  locale,
  programId,
  dayId,
  item,
  open,
  onOpenChange,
}: {
  locale: AppLocale;
  programId: string;
  dayId: string;
  item?: ExistingItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("programs.itemDialog");
  const tErrors = useTranslations("programs.errors");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState(item?.exercises ?? null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ItemFormInput>({
    resolver: zodResolver(itemSchema),
    defaultValues: item
      ? {
          exercise_id: item.exercise_id,
          sets: item.sets,
          reps: item.reps,
          rest_seconds: item.rest_seconds ?? undefined,
          notes_ar: item.notes_ar ?? "",
          notes_en: item.notes_en ?? "",
        }
      : { sets: 3, reps: "8-12" },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("exercise_id", data.exercise_id);
    if (data.sets != null) formData.set("sets", String(data.sets));
    if (data.reps) formData.set("reps", data.reps);
    if (data.rest_seconds != null) formData.set("rest_seconds", String(data.rest_seconds));
    if (data.notes_ar) formData.set("notes_ar", data.notes_ar);
    if (data.notes_en) formData.set("notes_en", data.notes_en);

    startTransition(async () => {
      const result = item
        ? await updateItemAction(locale, programId, item.id, formData)
        : await addItemAction(locale, programId, dayId, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      reset();
      setSelectedExercise(null);
      onOpenChange(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? t("editTitle") : t("addTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label>{t("exercise")}</Label>
            <ExercisePicker
              locale={locale}
              selectedId={selectedExercise?.id ?? null}
              onSelect={(exercise) => {
                setSelectedExercise(exercise);
                setValue("exercise_id", exercise.id, { shouldValidate: true });
              }}
            />
            {selectedExercise && (
              <p className="text-sm text-muted-foreground">
                {locale === "ar" ? selectedExercise.name_ar : selectedExercise.name_en}
              </p>
            )}
            {errors.exercise_id && <p className="text-sm text-destructive">{errors.exercise_id.message}</p>}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sets">{t("sets")}</Label>
              <Input id="sets" type="number" min={1} max={20} {...register("sets")} />
            </div>
            <div className="col-span-2 flex flex-col gap-2">
              <Label htmlFor="reps">{t("reps")}</Label>
              <Input id="reps" {...register("reps")} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rest_seconds">{t("restSeconds")}</Label>
            <Input id="rest_seconds" type="number" min={0} max={900} {...register("rest_seconds")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes_ar">{t("notesAr")}</Label>
            <Textarea id="notes_ar" dir="rtl" {...register("notes_ar")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes_en">{t("notesEn")}</Label>
            <Textarea id="notes_en" dir="ltr" {...register("notes_en")} />
          </div>
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending || !selectedExercise}>
            {t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
