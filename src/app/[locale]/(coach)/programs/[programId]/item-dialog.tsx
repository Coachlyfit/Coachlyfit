"use client";

import { useState, useTransition } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AppLocale } from "@/domain/locale";
import type { ProgressionRule } from "@/domain/programs/progression";
import { itemSchema, type ItemFormInput } from "../schemas";
import { addItemAction, updateItemAction } from "../actions";
import { ExercisePicker } from "./exercise-picker";

type ExistingItemSet = { reps: number; weight: number | null; rest_seconds: number | null };
type ExistingItem = {
  id: string;
  exercise_id: string;
  progression_rule: string;
  notes_ar: string | null;
  notes_en: string | null;
  exercises: { id: string; name_ar: string; name_en: string };
  program_item_sets: ExistingItemSet[]; // must already be ordered by set_index
};

const PROGRESSION_RULES: { value: ProgressionRule; labelKey: string }[] = [
  { value: "none", labelKey: "progressionNone" },
  { value: "plus_2_5kg_week", labelKey: "progressionPlus25" },
  { value: "plus_5kg_week", labelKey: "progressionPlus5" },
  { value: "plus_1_rep_week", labelKey: "progressionPlus1Rep" },
];

export function ItemDialog({
  locale,
  programId,
  dayId,
  item,
  initialExercise,
  open,
  onOpenChange,
}: {
  locale: AppLocale;
  programId: string;
  dayId: string;
  item?: ExistingItem;
  /** Pre-selects an exercise on the "add" path — used by the exercise
   * sidebar's click-to-add, which already knows which exercise the coach
   * picked before this dialog even opens. Ignored when `item` is set. */
  initialExercise?: { id: string; name_ar: string; name_en: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("programs.itemDialog");
  const tErrors = useTranslations("programs.errors");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState(item?.exercises ?? initialExercise ?? null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<ItemFormInput>({
    resolver: zodResolver(itemSchema),
    defaultValues: item
      ? {
          exercise_id: item.exercise_id,
          sets:
            item.program_item_sets.length > 0
              ? item.program_item_sets.map((s) => ({
                  reps: s.reps,
                  weight: s.weight ?? undefined,
                  rest_seconds: s.rest_seconds ?? undefined,
                }))
              : [{ reps: 10 }],
          progression_rule: item.progression_rule as ProgressionRule,
          notes_ar: item.notes_ar ?? "",
          notes_en: item.notes_en ?? "",
        }
      : { exercise_id: initialExercise?.id, sets: [{ reps: 10 }], progression_rule: "none" },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "sets" });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("exercise_id", data.exercise_id);
    formData.set("sets", JSON.stringify(data.sets));
    formData.set("progression_rule", data.progression_rule ?? "none");
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
      <DialogContent className="sm:max-w-lg">
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

          <div className="flex flex-col gap-2">
            <Label>{t("sets")}</Label>
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-end gap-2 rounded-md border border-border p-2">
                <span className="pb-2 font-mono text-xs text-muted-foreground">{index + 1}</span>
                <div className="flex flex-1 flex-col gap-1">
                  <Label htmlFor={`sets.${index}.reps`} className="text-xs text-muted-foreground">
                    {t("reps")}
                  </Label>
                  <Input
                    id={`sets.${index}.reps`}
                    type="number"
                    min={1}
                    max={100}
                    {...register(`sets.${index}.reps` as const)}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <Label htmlFor={`sets.${index}.weight`} className="text-xs text-muted-foreground">
                    {t("weight")}
                  </Label>
                  <Input
                    id={`sets.${index}.weight`}
                    type="number"
                    step="0.5"
                    min={0}
                    {...register(`sets.${index}.weight` as const)}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <Label htmlFor={`sets.${index}.rest_seconds`} className="text-xs text-muted-foreground">
                    {t("restSeconds")}
                  </Label>
                  <Input
                    id={`sets.${index}.rest_seconds`}
                    type="number"
                    min={0}
                    max={900}
                    {...register(`sets.${index}.rest_seconds` as const)}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => append({ reps: 10 })}>
              <Plus className="size-4" />
              {t("addSet")}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="progression_rule">{t("progressionRule")}</Label>
            <Controller
              name="progression_rule"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  items={PROGRESSION_RULES.map((rule) => ({ value: rule.value, label: t(rule.labelKey) }))}
                >
                  <SelectTrigger id="progression_rule">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROGRESSION_RULES.map((rule) => (
                      <SelectItem key={rule.value} value={rule.value}>
                        {t(rule.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
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
