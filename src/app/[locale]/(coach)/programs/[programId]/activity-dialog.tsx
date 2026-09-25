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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { activitySchema, type ActivityFormInput } from "../schemas";
import { addActivityAction, updateActivityAction, copyActivityToDaysAction } from "../actions";

const CARDIO_MODALITIES = ["walking", "running", "cycling", "rowing", "stairmaster", "swimming", "elliptical", "hiit", "other"] as const;
const RECOVERY_MODALITIES = ["foam_rolling", "stretching", "massage", "sauna", "cold_plunge", "breathwork", "other"] as const;
const INTENSITIES = ["low", "moderate", "high", "intervals"] as const;

type ExistingActivity = {
  id: string;
  kind: string;
  modality: string;
  duration_min: number | null;
  distance_km: number | null;
  intensity: string | null;
  hr_zone: number | null;
  kcal_target: number | null;
  pace: string | null;
  notes_ar: string | null;
  notes_en: string | null;
  log_required: boolean;
};

export function ActivityDialog({
  locale,
  programId,
  dayId,
  activity,
  defaultKind = "cardio",
  otherDays = [],
  open,
  onOpenChange,
}: {
  locale: string;
  programId: string;
  dayId: string;
  activity?: ExistingActivity;
  defaultKind?: "cardio" | "recovery";
  /** Every other day in the program, for "also add to" — only offered on
   * create, not edit (copying an edit would be ambiguous about which
   * version to copy). */
  otherDays?: { id: string; label: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("programs.activityDialog");
  const tErrors = useTranslations("programs.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [copyToDays, setCopyToDays] = useState<Set<string>>(new Set());

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors },
  } = useForm<ActivityFormInput>({
    resolver: zodResolver(activitySchema),
    defaultValues: activity
      ? {
          kind: activity.kind as ActivityFormInput["kind"],
          modality: activity.modality as ActivityFormInput["modality"],
          duration_min: activity.duration_min ?? undefined,
          distance_km: activity.distance_km ?? undefined,
          intensity: (activity.intensity as ActivityFormInput["intensity"]) ?? undefined,
          hr_zone: activity.hr_zone ?? undefined,
          kcal_target: activity.kcal_target ?? undefined,
          pace: activity.pace ?? "",
          notes_ar: activity.notes_ar ?? "",
          notes_en: activity.notes_en ?? "",
          log_required: activity.log_required,
        }
      : { kind: defaultKind, log_required: true },
  });

  const kind = watch("kind");
  const modalities = kind === "recovery" ? RECOVERY_MODALITIES : CARDIO_MODALITIES;

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("kind", data.kind);
    formData.set("modality", data.modality);
    if (data.duration_min != null) formData.set("duration_min", String(data.duration_min));
    if (data.distance_km != null) formData.set("distance_km", String(data.distance_km));
    if (data.intensity) formData.set("intensity", data.intensity);
    if (data.hr_zone != null) formData.set("hr_zone", String(data.hr_zone));
    if (data.kcal_target != null) formData.set("kcal_target", String(data.kcal_target));
    if (data.pace) formData.set("pace", data.pace);
    if (data.notes_ar) formData.set("notes_ar", data.notes_ar);
    if (data.notes_en) formData.set("notes_en", data.notes_en);
    formData.set("log_required", data.log_required === false ? "false" : "true");

    startTransition(async () => {
      if (activity) {
        const result = await updateActivityAction(locale, programId, activity.id, formData);
        if (result?.error) {
          setFormError(result.error);
          return;
        }
      } else {
        const result = await addActivityAction(locale, programId, dayId, formData);
        if ("error" in result) {
          setFormError(result.error);
          return;
        }
        if (copyToDays.size > 0) {
          await copyActivityToDaysAction(locale, programId, result.id, Array.from(copyToDays));
        }
      }
      reset();
      setCopyToDays(new Set());
      onOpenChange(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{activity ? t("editTitle") : t("addTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="kind">{t("kind")}</Label>
            <Controller
              name="kind"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  items={[
                    { value: "cardio", label: t("kindCardio") },
                    { value: "recovery", label: t("kindRecovery") },
                  ]}
                >
                  <SelectTrigger id="kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cardio">{t("kindCardio")}</SelectItem>
                    <SelectItem value="recovery">{t("kindRecovery")}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="modality">{t("modality")}</Label>
            <Controller
              name="modality"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  items={modalities.map((m) => ({ value: m, label: t(`modalities.${m}`) }))}
                >
                  <SelectTrigger id="modality">
                    <SelectValue placeholder={t("modalityPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {modalities.map((m) => (
                      <SelectItem key={m} value={m}>
                        {t(`modalities.${m}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.modality && <p className="text-sm text-destructive">{t("modalityRequired")}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="duration_min">{t("durationMin")}</Label>
              <Input id="duration_min" type="number" min={1} max={600} {...register("duration_min")} />
            </div>
            {kind === "cardio" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="distance_km">{t("distanceKm")}</Label>
                <Input id="distance_km" type="number" step="0.01" min={0.01} {...register("distance_km")} />
              </div>
            )}
          </div>

          {kind === "cardio" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="intensity">{t("intensity")}</Label>
                <Controller
                  name="intensity"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || "unset"}
                      onValueChange={(v) => field.onChange(v === "unset" ? "" : v)}
                      items={[
                        { value: "unset", label: t("intensityUnset") },
                        ...INTENSITIES.map((i) => ({ value: i, label: t(`intensities.${i}`) })),
                      ]}
                    >
                      <SelectTrigger id="intensity">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">{t("intensityUnset")}</SelectItem>
                        {INTENSITIES.map((i) => (
                          <SelectItem key={i} value={i}>
                            {t(`intensities.${i}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="hr_zone">{t("hrZone")}</Label>
                <Input id="hr_zone" type="number" min={1} max={5} {...register("hr_zone")} />
              </div>
            </div>
          )}

          {kind === "cardio" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="kcal_target">{t("kcalTarget")}</Label>
                <Input id="kcal_target" type="number" min={1} max={5000} {...register("kcal_target")} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pace">{t("pace")}</Label>
                <Input id="pace" placeholder={t("pacePlaceholder")} {...register("pace")} />
              </div>
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

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" {...register("log_required")} />
            {t("logRequired")}
          </label>

          {!activity && otherDays.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>{t("alsoAddTo")}</Label>
              <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
                {otherDays.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={copyToDays.has(d.id)}
                      onChange={() =>
                        setCopyToDays((prev) => {
                          const next = new Set(prev);
                          if (next.has(d.id)) next.delete(d.id);
                          else next.add(d.id);
                          return next;
                        })
                      }
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending} className="min-w-24">
            {pending ? tCommon("pending") : t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
