"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/ui/segmented";
import { checkinSchema, type CheckinFormInput, type CheckinInput } from "./schemas";
import { submitCheckinAction } from "./actions";
import type { Database } from "@/lib/supabase/database.types";

type Checkin = Database["public"]["Tables"]["checkins"]["Row"];

const RATING_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));

export function CheckinForm({
  locale,
  today,
  existing,
  onSubmitted,
}: {
  locale: string;
  today: string;
  existing: Checkin | null;
  /** Called after a successful save, instead of showing the inline "saved"
   * message — used by the full-screen check-in stack (/c/checkin), which
   * navigates to a shared Done screen rather than staying on the form. */
  onSubmitted?: () => void;
}) {
  const t = useTranslations("progress.checkin");
  const tErrors = useTranslations("progress.errors");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CheckinFormInput, unknown, CheckinInput>({
    resolver: zodResolver(checkinSchema),
    defaultValues: {
      checkin_date: today,
      weight: existing?.weight ?? undefined,
      mood: existing?.mood ?? undefined,
      energy: existing?.energy ?? undefined,
      adherence: existing?.adherence ?? undefined,
      sleep_hours: existing?.sleep_hours ?? undefined,
      notes: existing?.notes ?? undefined,
    },
  });

  const onSubmit = handleSubmit((data) => {
    setSaved(false);
    setFormError(null);
    const formData = new FormData();
    formData.set("checkin_date", data.checkin_date);
    if (data.weight !== undefined) formData.set("weight", String(data.weight));
    if (data.mood !== undefined) formData.set("mood", String(data.mood));
    if (data.energy !== undefined) formData.set("energy", String(data.energy));
    if (data.adherence !== undefined) formData.set("adherence", String(data.adherence));
    if (data.sleep_hours !== undefined) formData.set("sleep_hours", String(data.sleep_hours));
    if (data.notes) formData.set("notes", data.notes);
    startTransition(async () => {
      const result = await submitCheckinAction(locale, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      if (onSubmitted) {
        onSubmitted();
        return;
      }
      setSaved(true);
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="weight">{t("weight")}</Label>
          <Input id="weight" type="number" step="0.1" className="h-11" {...register("weight")} />
          {errors.weight && <p className="text-sm text-destructive">{errors.weight.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="adherence">{t("adherence")}</Label>
          <Input id="adherence" type="number" min={0} max={100} className="h-11" {...register("adherence")} />
          {errors.adherence && <p className="text-sm text-destructive">{errors.adherence.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sleep_hours">{t("sleepHours")}</Label>
          <Input id="sleep_hours" type="number" step="0.5" min={0} max={24} className="h-11" {...register("sleep_hours")} />
          {errors.sleep_hours && <p className="text-sm text-destructive">{errors.sleep_hours.message}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mood">{t("mood")}</Label>
        <Controller
          name="mood"
          control={control}
          render={({ field }) => (
            <Segmented
              value={field.value ? String(field.value) : ""}
              onChange={(value) => field.onChange(Number(value))}
              options={RATING_OPTIONS}
              label={t("mood")}
              className="w-full [&>button]:h-11 [&>button]:flex-1"
            />
          )}
        />
        {errors.mood && <p className="text-sm text-destructive">{errors.mood.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="energy">{t("energy")}</Label>
        <Controller
          name="energy"
          control={control}
          render={({ field }) => (
            <Segmented
              value={field.value ? String(field.value) : ""}
              onChange={(value) => field.onChange(Number(value))}
              options={RATING_OPTIONS}
              label={t("energy")}
              className="w-full [&>button]:h-11 [&>button]:flex-1"
            />
          )}
        />
        {errors.energy && <p className="text-sm text-destructive">{errors.energy.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Textarea id="notes" {...register("notes")} />
      </div>
      {saved && <p className="text-sm text-success">{t("submitted")}</p>}
      {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
      <Button type="submit" disabled={pending} className="h-11">
        {t("submit")}
      </Button>
    </form>
  );
}
