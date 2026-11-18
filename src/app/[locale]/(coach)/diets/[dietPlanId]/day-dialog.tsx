"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/appointments/shared";
import type { DietPlanDay } from "@/domain/nutrition/diet-plans.service";
import { daySchema, type DayFormInput } from "../schemas";
import { addDayAction, updateDayAction } from "../actions";

const KINDS = ["training", "rest", "custom"] as const;

/** Add a day-type to the plan, or (with `day`) rename it / change its kind /
 * edit its notes. Targets are edited in the macro summary, not here. */
export function DayDialog({
  locale,
  dietPlanId,
  day,
  open,
  onOpenChange,
  onSaved,
}: {
  locale: string;
  dietPlanId: string;
  day?: DietPlanDay;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the day's id once saved — the tabs jump to a new day. */
  onSaved: (dayId: string) => void;
}) {
  const t = useTranslations("diets.days.dialog");
  const tKinds = useTranslations("diets.days.kinds");
  const tErrors = useTranslations("diets.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DayFormInput>({
    resolver: zodResolver(daySchema),
    defaultValues: day
      ? {
          name_ar: day.name_ar,
          name_en: day.name_en,
          kind: day.kind as DayFormInput["kind"],
          notes_ar: day.notes_ar ?? "",
          notes_en: day.notes_en ?? "",
        }
      : { name_ar: "", name_en: "", kind: "custom", notes_ar: "", notes_en: "" },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("name_ar", data.name_ar);
    formData.set("name_en", data.name_en);
    formData.set("kind", data.kind);
    if (data.notes_ar) formData.set("notes_ar", data.notes_ar);
    if (data.notes_en) formData.set("notes_en", data.notes_en);

    startTransition(async () => {
      if (day) {
        const result = await updateDayAction(locale, dietPlanId, day.id, formData);
        if (result?.error) return setFormError(result.error);
        onSaved(day.id);
      } else {
        const result = await addDayAction(locale, dietPlanId, formData);
        if ("error" in result) return setFormError(result.error);
        reset();
        onSaved(result.id);
      }
      onOpenChange(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{day ? t("editTitle") : t("addTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="day_name_ar">{t("nameAr")}</Label>
            <Input id="day_name_ar" dir="rtl" maxLength={60} {...register("name_ar")} />
            {errors.name_ar && <p className="text-sm text-destructive">{tErrors("invalid_input")}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="day_name_en">{t("nameEn")}</Label>
            <Input id="day_name_en" dir="ltr" maxLength={60} {...register("name_en")} />
            {errors.name_en && <p className="text-sm text-destructive">{tErrors("invalid_input")}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="day_kind">{t("kind")}</Label>
            <NativeSelect id="day_kind" {...register("kind")}>
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {tKinds(kind)}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">{t("kindHint")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="day_notes_ar">{t("notesAr")}</Label>
            <Textarea id="day_notes_ar" dir="rtl" rows={2} maxLength={500} {...register("notes_ar")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="day_notes_en">{t("notesEn")}</Label>
            <Textarea id="day_notes_en" dir="ltr" rows={2} maxLength={500} {...register("notes_en")} />
          </div>
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending} className="min-w-24">
              {pending ? tCommon("pending") : tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
