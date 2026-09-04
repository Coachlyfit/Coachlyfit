"use client";

import { Controller, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MUSCLE_GROUPS } from "@/domain/library/taxonomy";
import type { CreateExerciseInput } from "./schemas";

const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;

/** The exercise form fields, shared by the coach's create/clone/edit dialog
 * (exercise-dialog.tsx) and the admin global-exercise-dialog — pulled out
 * once a third mode made copy-pasting the block a real duplication risk
 * rather than extracting for its own sake. `idPrefix` keeps `htmlFor`s from
 * colliding if a caller ever mounts two instances at once (the coach page's
 * "Add exercise" trigger and its edit/clone dialog both live in the DOM). */
export function ExerciseFields({
  idPrefix = "",
  register,
  control,
  errors,
  showCoachNotes = true,
}: {
  idPrefix?: string;
  register: UseFormRegister<CreateExerciseInput>;
  control: Control<CreateExerciseInput>;
  errors: FieldErrors<CreateExerciseInput>;
  /** Off for the admin global dialog: coach_notes_ar/en is a coach's private
   * commentary on their own clone, and a global row has no owning coach —
   * offering the field there would read as admin notes with nowhere
   * meaningful to attach to. */
  showCoachNotes?: boolean;
}) {
  const t = useTranslations("library.exercise");
  const tGroups = useTranslations("library.muscleGroups");
  const id = (name: string) => `${idPrefix}${name}`;

  return (
    <>
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
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("muscle_group")}>{t("muscleGroup")}</Label>
        <Controller
          name="muscle_group"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={field.onChange}
              items={MUSCLE_GROUPS.map((group) => ({ value: group, label: tGroups(group) }))}
            >
              <SelectTrigger id={id("muscle_group")}>
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
        <Label htmlFor={id("equipment")}>{t("equipment")}</Label>
        <Input id={id("equipment")} {...register("equipment")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("video_url")}>{t("videoUrl")}</Label>
        <Input
          id={id("video_url")}
          type="url"
          placeholder="https://youtube.com/watch?v=..."
          {...register("video_url")}
        />
        {errors.video_url && <p className="text-sm text-destructive">{errors.video_url.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("image_url")}>{t("imageUrl")}</Label>
        <Input id={id("image_url")} type="url" placeholder="https://.../demo.gif" {...register("image_url")} />
        {errors.image_url && <p className="text-sm text-destructive">{errors.image_url.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("instructions_ar")}>{t("instructionsAr")}</Label>
        <Textarea id={id("instructions_ar")} dir="rtl" rows={3} {...register("instructions_ar")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("instructions_en")}>{t("instructionsEn")}</Label>
        <Textarea id={id("instructions_en")} dir="ltr" rows={3} {...register("instructions_en")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("cues_ar")}>{t("cuesAr")}</Label>
        <Textarea id={id("cues_ar")} dir="rtl" rows={3} placeholder={t("cuesPlaceholder")} {...register("cues_ar")} />
        <p className="text-xs text-muted-foreground">{t("cuesHint")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("cues_en")}>{t("cuesEn")}</Label>
        <Textarea id={id("cues_en")} dir="ltr" rows={3} placeholder={t("cuesPlaceholder")} {...register("cues_en")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("steps_ar")}>{t("stepsAr")}</Label>
        <Textarea id={id("steps_ar")} dir="rtl" rows={3} placeholder={t("linesPlaceholder")} {...register("steps_ar")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("steps_en")}>{t("stepsEn")}</Label>
        <Textarea id={id("steps_en")} dir="ltr" rows={3} placeholder={t("linesPlaceholder")} {...register("steps_en")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("mistakes_ar")}>{t("mistakesAr")}</Label>
        <Textarea id={id("mistakes_ar")} dir="rtl" rows={2} placeholder={t("linesPlaceholder")} {...register("mistakes_ar")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("mistakes_en")}>{t("mistakesEn")}</Label>
        <Textarea id={id("mistakes_en")} dir="ltr" rows={2} placeholder={t("linesPlaceholder")} {...register("mistakes_en")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("safety_ar")}>{t("safetyAr")}</Label>
        <Textarea id={id("safety_ar")} dir="rtl" rows={2} {...register("safety_ar")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("safety_en")}>{t("safetyEn")}</Label>
        <Textarea id={id("safety_en")} dir="ltr" rows={2} {...register("safety_en")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("tempo")}>{t("tempo")}</Label>
        <Input id={id("tempo")} placeholder="3-1-1-0" {...register("tempo")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("primary_muscles")}>{t("primaryMuscles")}</Label>
        <Textarea id={id("primary_muscles")} rows={2} placeholder={t("linesPlaceholder")} {...register("primary_muscles")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("secondary_muscles")}>{t("secondaryMuscles")}</Label>
        <Textarea id={id("secondary_muscles")} rows={2} placeholder={t("linesPlaceholder")} {...register("secondary_muscles")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("difficulty")}>{t("difficulty")}</Label>
        <Controller
          name="difficulty"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={field.onChange}
              items={DIFFICULTIES.map((d) => ({ value: d, label: t(`difficultyLevel.${d}`) }))}
            >
              <SelectTrigger id={id("difficulty")}>
                <SelectValue placeholder={t("difficultyPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTIES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {t(`difficultyLevel.${d}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("thumbnail_url")}>{t("thumbnailUrl")}</Label>
        <Input id={id("thumbnail_url")} type="url" placeholder="https://.../thumb.jpg" {...register("thumbnail_url")} />
        {errors.thumbnail_url && <p className="text-sm text-destructive">{errors.thumbnail_url.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("video_url_alt")}>{t("videoUrlAlt")}</Label>
        <Input id={id("video_url_alt")} type="url" placeholder="https://youtube.com/watch?v=..." {...register("video_url_alt")} />
        {errors.video_url_alt && <p className="text-sm text-destructive">{errors.video_url_alt.message}</p>}
      </div>
      {showCoachNotes && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("coach_notes_ar")}>{t("coachNotesAr")}</Label>
            <Textarea id={id("coach_notes_ar")} dir="rtl" rows={2} {...register("coach_notes_ar")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("coach_notes_en")}>{t("coachNotesEn")}</Label>
            <Textarea id={id("coach_notes_en")} dir="ltr" rows={2} {...register("coach_notes_en")} />
          </div>
        </>
      )}
    </>
  );
}
