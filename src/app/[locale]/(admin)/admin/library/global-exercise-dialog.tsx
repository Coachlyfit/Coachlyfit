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
import { normalizeMeasurementType } from "@/domain/library/measurement";
import {
  type adminSearchExercisesAction,
  createGlobalExerciseAction,
  updateGlobalExerciseAction,
} from "./actions";

type ExistingExercise = Awaited<ReturnType<typeof adminSearchExercisesAction>>["rows"][number];

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
      measurement_type: normalizeMeasurementType(exercise?.measurement_type),
      equipment: exercise?.equipment ?? "",
      video_url: exercise?.video_url ?? "",
      image_url: exercise?.image_url ?? "",
      instructions_ar: exercise?.instructions_ar ?? "",
      instructions_en: exercise?.instructions_en ?? "",
      cues_ar: exercise?.cues_ar?.join("\n") ?? "",
      cues_en: exercise?.cues_en?.join("\n") ?? "",
      steps_ar: exercise?.steps_ar?.join("\n") ?? "",
      steps_en: exercise?.steps_en?.join("\n") ?? "",
      mistakes_ar: exercise?.mistakes_ar?.join("\n") ?? "",
      mistakes_en: exercise?.mistakes_en?.join("\n") ?? "",
      safety_ar: exercise?.safety_ar ?? "",
      safety_en: exercise?.safety_en ?? "",
      tempo: exercise?.tempo ?? "",
      primary_muscles: exercise?.primary_muscles?.join("\n") ?? "",
      secondary_muscles: exercise?.secondary_muscles?.join("\n") ?? "",
      difficulty: (exercise?.difficulty as CreateExerciseInput["difficulty"]) ?? undefined,
      thumbnail_url: exercise?.thumbnail_url ?? "",
      video_url_alt: exercise?.video_url_alt ?? "",
    },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      if (value) formData.set(key, String(value));
    }
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
