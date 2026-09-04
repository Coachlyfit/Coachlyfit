"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createExerciseSchema,
  type CreateExerciseInput,
} from "@/app/[locale]/(coach)/library/schemas";
import { ExerciseFields } from "@/app/[locale]/(coach)/library/exercise-fields";
import { createGlobalExerciseAction, updateGlobalExerciseAction } from "./actions";

type ExistingExercise = {
  id: string;
  name_ar: string;
  name_en: string;
  muscle_group: string | null;
  equipment: string | null;
  video_url: string | null;
  image_url: string | null;
  instructions_ar: string | null;
  instructions_en: string | null;
};

/** Create and edit share one form — the only difference is which action runs
 * and whether the fields start populated. `exercise` present = edit mode.
 * Fields come from the coach dialogs' shared ExerciseFields (with
 * showCoachNotes off — see that component for why), so curating a global's
 * instructions/media stays in sync with what a coach's own clone can hold. */
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
  const tErrors = useTranslations("library.errors");
  const tCommon = useTranslations("common");
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
    // ExerciseDialog for the Base UI gotcha this avoids.
    defaultValues: {
      name_ar: exercise?.name_ar ?? "",
      name_en: exercise?.name_en ?? "",
      muscle_group:
        (exercise?.muscle_group as CreateExerciseInput["muscle_group"]) ?? "other",
      equipment: exercise?.equipment ?? "",
      video_url: exercise?.video_url ?? "",
      image_url: exercise?.image_url ?? "",
      instructions_ar: exercise?.instructions_ar ?? "",
      instructions_en: exercise?.instructions_en ?? "",
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
    if (data.image_url) formData.set("image_url", data.image_url);
    if (data.instructions_ar) formData.set("instructions_ar", data.instructions_ar);
    if (data.instructions_en) formData.set("instructions_en", data.instructions_en);
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
          <ExerciseFields
            idPrefix="g_"
            register={register}
            control={control}
            errors={errors}
            showCoachNotes={false}
          />
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
