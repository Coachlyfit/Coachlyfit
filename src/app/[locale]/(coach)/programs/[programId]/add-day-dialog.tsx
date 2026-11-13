"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
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
import { daySchema, type DayFormInput } from "../schemas";
import { addDayAction, addSessionAction, updateDayAction } from "../actions";

type ExistingDay = {
  id: string;
  day_index: number;
  label_ar: string | null;
  label_en: string | null;
  weekday: number | null;
  notes_ar: string | null;
  notes_en: string | null;
  /** Set on an extra session of a day. */
  parent_day_id?: string | null;
};

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function AddDayDialog({
  locale,
  programId,
  nextDayIndex,
  day,
  parentDayId,
  scheduleMode,
  open,
  onOpenChange,
}: {
  locale: string;
  programId: string;
  nextDayIndex: number;
  day?: ExistingDay;
  /** Adds an extra session (AM/PM split) under this day instead of a new day. */
  parentDayId?: string;
  /** Only weekly-mode programs show the weekday picker — a cycle-mode
   * program has no calendar meaning to attach a weekday to (see
   * program-cycle.ts's header comment). */
  scheduleMode: "cycle" | "weekly";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("programs.dayDialog");
  const tBuilder = useTranslations("programs.builder");
  const tErrors = useTranslations("programs.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  // A session has no schedule position of its own, so no weekday to pick.
  const isSession = !!parentDayId || !!day?.parent_day_id;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<DayFormInput>({
    resolver: zodResolver(daySchema),
    defaultValues: day
      ? {
          day_index: day.day_index,
          label_ar: day.label_ar ?? "",
          label_en: day.label_en ?? "",
          weekday: day.weekday ?? undefined,
          notes_ar: day.notes_ar ?? "",
          notes_en: day.notes_en ?? "",
        }
      : { day_index: nextDayIndex },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("day_index", String(data.day_index));
    if (data.label_ar) formData.set("label_ar", data.label_ar);
    if (data.label_en) formData.set("label_en", data.label_en);
    if (data.weekday !== undefined && data.weekday !== null) formData.set("weekday", String(data.weekday));
    if (data.notes_ar) formData.set("notes_ar", data.notes_ar);
    if (data.notes_en) formData.set("notes_en", data.notes_en);

    startTransition(async () => {
      const result = day
        ? await updateDayAction(locale, programId, day.id, formData)
        : parentDayId
          ? await addSessionAction(locale, programId, parentDayId, formData)
          : await addDayAction(locale, programId, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      reset();
      onOpenChange(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isSession ? (day ? t("editSessionTitle") : t("addSessionTitle")) : day ? t("editTitle") : t("addTitle")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <p className="text-sm text-muted-foreground">
            {isSession
              ? tBuilder("sessionN", { n: day?.day_index ?? nextDayIndex })
              : tBuilder("dayN", { n: day?.day_index ?? nextDayIndex })}
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="label_ar">{t("labelAr")}</Label>
            <Input id="label_ar" dir="rtl" {...register("label_ar")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="label_en">{t("labelEn")}</Label>
            <Input id="label_en" dir="ltr" {...register("label_en")} />
          </div>
          {scheduleMode === "weekly" && !isSession && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="weekday">{t("weekday")}</Label>
              <Controller
                name="weekday"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value != null ? String(field.value) : undefined}
                    onValueChange={(v) => field.onChange(Number(v))}
                    items={WEEKDAYS.map((w) => ({ value: String(w), label: tBuilder(`weekdayShort.${w}`) }))}
                  >
                    <SelectTrigger id="weekday">
                      <SelectValue placeholder={t("weekdayPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((w) => (
                        <SelectItem key={w} value={String(w)}>
                          {tBuilder(`weekdayShort.${w}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes_ar">{t("notesAr")}</Label>
            <Textarea id="notes_ar" dir="rtl" rows={2} {...register("notes_ar")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes_en">{t("notesEn")}</Label>
            <Textarea id="notes_en" dir="ltr" rows={2} {...register("notes_en")} />
          </div>
          {errors.day_index && <p className="text-sm text-destructive">{errors.day_index.message}</p>}
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending} className="min-w-24">
            {pending ? tCommon("pending") : t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
