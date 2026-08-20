"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { daySchema, type DayFormInput } from "../schemas";
import { addDayAction, updateDayAction } from "../actions";

type ExistingDay = { id: string; day_index: number; label_ar: string | null; label_en: string | null };

export function AddDayDialog({
  locale,
  programId,
  nextDayIndex,
  day,
  open,
  onOpenChange,
}: {
  locale: string;
  programId: string;
  nextDayIndex: number;
  day?: ExistingDay;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("programs.dayDialog");
  const tBuilder = useTranslations("programs.builder");
  const tErrors = useTranslations("programs.errors");
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
      ? { day_index: day.day_index, label_ar: day.label_ar ?? "", label_en: day.label_en ?? "" }
      : { day_index: nextDayIndex },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("day_index", String(data.day_index));
    if (data.label_ar) formData.set("label_ar", data.label_ar);
    if (data.label_en) formData.set("label_en", data.label_en);

    startTransition(async () => {
      const result = day
        ? await updateDayAction(locale, programId, day.id, formData)
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
          <DialogTitle>{day ? t("editTitle") : t("addTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <p className="text-sm text-muted-foreground">
            {tBuilder("dayN", { n: day?.day_index ?? nextDayIndex })}
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="label_ar">{t("labelAr")}</Label>
            <Input id="label_ar" dir="rtl" {...register("label_ar")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="label_en">{t("labelEn")}</Label>
            <Input id="label_en" dir="ltr" {...register("label_en")} />
          </div>
          {errors.day_index && <p className="text-sm text-destructive">{errors.day_index.message}</p>}
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending}>
            {t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
