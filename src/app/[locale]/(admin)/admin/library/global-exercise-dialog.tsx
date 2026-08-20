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
import { MUSCLE_GROUPS } from "@/domain/library/taxonomy";
import {
  createExerciseSchema,
  type CreateExerciseInput,
} from "@/app/[locale]/(coach)/library/schemas";
import { createGlobalExerciseAction, updateGlobalExerciseAction } from "./actions";

type ExistingExercise = {
  id: string;
  name_ar: string;
  name_en: string;
  muscle_group: string | null;
  equipment: string | null;
  video_url: string | null;
};

/** Create and edit share one form — the only difference is which action runs
 * and whether the fields start populated. `exercise` present = edit mode. */
export function GlobalExerciseDialog({
  locale,
  exercise,
  open,
  onOpenChange,
  onSaved,
}: {
  locale: string;
  exercise?: ExistingExercise;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("library.exercise");
  const tAdmin = useTranslations("admin.library");
  const tGroups = useTranslations("library.muscleGroups");
  const tErrors = useTranslations("library.errors");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const isEdit = !!exercise;
  const isOpen = open ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateExerciseInput>({
    resolver: zodResolver(createExerciseSchema),
    // Select must be controlled from the first render — see the coach-side
    // AddExerciseDialog for the Base UI gotcha this avoids.
    defaultValues: {
      name_ar: exercise?.name_ar ?? "",
      name_en: exercise?.name_en ?? "",
      muscle_group:
        (exercise?.muscle_group as CreateExerciseInput["muscle_group"]) ?? "other",
      equipment: exercise?.equipment ?? "",
      video_url: exercise?.video_url ?? "",
    },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("name_ar", data.name_ar);
    formData.set("name_en", data.name_en);
    if (data.muscle_group) formData.set("muscle_group", data.muscle_group);
    if (data.equipment) formData.set("equipment", data.equipment);
    if (data.video_url) formData.set("video_url", data.video_url);
    startTransition(async () => {
      const result = isEdit
        ? await updateGlobalExerciseAction(locale, exercise.id, formData)
        : await createGlobalExerciseAction(locale, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      if (!isEdit) reset();
      setOpen(false);
      onSaved();
    });
  });

  const title = isEdit ? tAdmin("editGlobal") : tAdmin("addGlobal");

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {!isEdit && (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus className="size-4" />
          {tAdmin("addGlobal")}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="g_name_ar">{t("nameAr")}</Label>
            <Input id="g_name_ar" dir="rtl" {...register("name_ar")} />
            {errors.name_ar && <p className="text-sm text-destructive">{errors.name_ar.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="g_name_en">{t("nameEn")}</Label>
            <Input id="g_name_en" dir="ltr" {...register("name_en")} />
            {errors.name_en && <p className="text-sm text-destructive">{errors.name_en.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="g_muscle_group">{t("muscleGroup")}</Label>
            <Controller
              name="muscle_group"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="g_muscle_group">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MUSCLE_GROUPS.map((group) => (
                      <SelectItem key={group} value={group}>
                        {tGroups(group)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="g_equipment">{t("equipment")}</Label>
            <Input id="g_equipment" {...register("equipment")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="g_video_url">{t("videoUrl")}</Label>
            <Input
              id="g_video_url"
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              {...register("video_url")}
            />
            {errors.video_url && (
              <p className="text-sm text-destructive">{errors.video_url.message}</p>
            )}
          </div>
          {formError && (
            <p className="text-sm text-destructive">
              {tErrors.has(formError) ? tErrors(formError) : tErrors("unknown")}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {isEdit ? tAdmin("edit") : t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
