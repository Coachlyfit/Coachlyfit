"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { normalizeMeasurementType } from "@/domain/library/measurement";
import { createExerciseSchema, type CreateExerciseInput } from "./schemas";
import { createExerciseAction, updateExerciseAction, type searchExercisesAction } from "./actions";
import { ExerciseFields } from "./exercise-fields";

type Exercise = Awaited<ReturnType<typeof searchExercisesAction>>["rows"][number];

type Mode = "create" | "clone" | "edit";

/** One form for all three ways a coach ends up here — same shape as the
 * admin GlobalExerciseDialog's create/edit split, extended with a third
 * mode. "create" owns its own trigger button and is uncontrolled by
 * default; "clone"/"edit" are always controlled by the caller (a button on
 * an exercise-card/list row), since there's nowhere generic to put their
 * trigger. */
export function ExerciseDialog({
  locale,
  mode,
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  locale: AppLocale;
  mode: Mode;
  /** The row being cloned from ("clone") or edited ("edit"). Unused for
   * "create". */
  item?: Exercise;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("library.exercise");
  const tCommon = useTranslations("common");
  const tLibrary = useTranslations("library");
  const tErrors = useTranslations("library.errors");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

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
    // Select must be controlled from the first render — Base UI warns
    // (correctly) if it flips uncontrolled -> controlled on first pick.
    defaultValues: {
      name_ar: item?.name_ar ?? "",
      name_en: item?.name_en ?? "",
      muscle_group: (item?.muscle_group as CreateExerciseInput["muscle_group"]) ?? "other",
      measurement_type: normalizeMeasurementType(item?.measurement_type),
      equipment: item?.equipment ?? "",
      video_url: item?.video_url ?? "",
      image_url: item?.image_url ?? "",
      instructions_ar: item?.instructions_ar ?? "",
      instructions_en: item?.instructions_en ?? "",
      coach_notes_ar: item?.coach_notes_ar ?? "",
      coach_notes_en: item?.coach_notes_en ?? "",
      steps_ar: item?.steps_ar?.join("\n") ?? "",
      steps_en: item?.steps_en?.join("\n") ?? "",
      mistakes_ar: item?.mistakes_ar?.join("\n") ?? "",
      mistakes_en: item?.mistakes_en?.join("\n") ?? "",
      safety_ar: item?.safety_ar ?? "",
      safety_en: item?.safety_en ?? "",
      tempo: item?.tempo ?? "",
      primary_muscles: item?.primary_muscles?.join("\n") ?? "",
      secondary_muscles: item?.secondary_muscles?.join("\n") ?? "",
      difficulty: (item?.difficulty as CreateExerciseInput["difficulty"]) ?? undefined,
      skill_group: (item?.skill_group as CreateExerciseInput["skill_group"]) ?? "",
      skill_level: item?.skill_level ?? undefined,
      thumbnail_url: item?.thumbnail_url ?? "",
      video_url_alt: item?.video_url_alt ?? "",
    },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("name_ar", data.name_ar);
    formData.set("name_en", data.name_en);
    if (data.muscle_group) formData.set("muscle_group", data.muscle_group);
    if (data.measurement_type) formData.set("measurement_type", data.measurement_type);
    if (data.equipment) formData.set("equipment", data.equipment);
    if (data.video_url) formData.set("video_url", data.video_url);
    if (data.image_url) formData.set("image_url", data.image_url);
    if (data.instructions_ar) formData.set("instructions_ar", data.instructions_ar);
    if (data.instructions_en) formData.set("instructions_en", data.instructions_en);
    if (data.coach_notes_ar) formData.set("coach_notes_ar", data.coach_notes_ar);
    if (data.coach_notes_en) formData.set("coach_notes_en", data.coach_notes_en);
    if (data.steps_ar) formData.set("steps_ar", data.steps_ar);
    if (data.steps_en) formData.set("steps_en", data.steps_en);
    if (data.mistakes_ar) formData.set("mistakes_ar", data.mistakes_ar);
    if (data.mistakes_en) formData.set("mistakes_en", data.mistakes_en);
    if (data.safety_ar) formData.set("safety_ar", data.safety_ar);
    if (data.safety_en) formData.set("safety_en", data.safety_en);
    if (data.tempo) formData.set("tempo", data.tempo);
    if (data.primary_muscles) formData.set("primary_muscles", data.primary_muscles);
    if (data.secondary_muscles) formData.set("secondary_muscles", data.secondary_muscles);
    if (data.difficulty) formData.set("difficulty", data.difficulty);
    if (data.skill_group) formData.set("skill_group", data.skill_group);
    if (data.skill_level != null) formData.set("skill_level", String(data.skill_level));
    if (data.thumbnail_url) formData.set("thumbnail_url", data.thumbnail_url);
    if (data.video_url_alt) formData.set("video_url_alt", data.video_url_alt);
    // Provenance is set once, here — "edit" never sends this, so an edit of
    // an already-cloned row can't rewrite (or forge) what it's based on.
    if (mode === "clone" && item) formData.set("source_exercise_id", item.id);

    startTransition(async () => {
      const result =
        mode === "edit" && item
          ? await updateExerciseAction(locale, item.id, formData)
          : await createExerciseAction(locale, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      if (mode === "create") reset();
      setOpen(false);
      onSaved();
    });
  });

  const title = mode === "edit" ? t("editTitle") : mode === "clone" ? t("cloneTitle") : t("add");
  const submitLabel = mode === "create" ? t("submit") : t("save");
  const idPrefix = `ex_${mode}_`;

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {mode === "create" && (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus className="size-4" />
          {t("add")}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {mode === "clone" && item && (
          <p className="text-sm text-muted-foreground">
            {tLibrary("basedOn", { name: pickLocale(item, locale) })}
          </p>
        )}
        {mode === "edit" && item?.source_exercise_id && (
          // Reads the CLONE's own source_name_*, not item's own name —
          // that's what survives a rename (20260805000001_library_clone.sql).
          <p className="text-sm text-muted-foreground">
            {tLibrary("basedOn", { name: pickLocale(item, locale, "source_name") })}
          </p>
        )}
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <ExerciseFields idPrefix={idPrefix} register={register} control={control} errors={errors} showSkill />
          {formError && (
            <p className="text-sm text-destructive">
              {tErrors.has(formError) ? tErrors(formError) : tErrors("unknown")}
            </p>
          )}
          <Button type="submit" disabled={pending} className="min-w-24">
            {pending ? tCommon("pending") : submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
