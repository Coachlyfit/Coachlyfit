"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { DietVariant, ProgramTree } from "@/domain/programs/programs.service";
import { Link } from "@/i18n/navigation";
import { createNutritionVariantAction, setDayNutritionAction, customizeDayNutritionAction } from "../actions";

type Day = ProgramTree["program_days"][number];

/** Assignment grid: one row per day, showing which nutrition variant it's
 * linked to (or none). A single select per day covers Approach A (every
 * day picks the same shared variant) and Approach B (each day picks its
 * own) with the same control — the difference is purely which variant ids
 * a coach happens to pick, not a different UI mode. "Customize" clones the
 * day's current variant and repoints just that day, giving it an
 * independent override without disturbing the days still sharing the
 * original. */
export function NutritionPanel({
  locale,
  programId,
  days,
  variants,
}: {
  locale: AppLocale;
  programId: string;
  days: Day[];
  variants: DietVariant[];
}) {
  const t = useTranslations("programs.nutrition");
  const tErrors = useTranslations("programs.errors");
  const tBuilder = useTranslations("programs.builder");
  const [creating, setCreating] = useState(false);
  const [newNameAr, setNewNameAr] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [pending, startTransition] = useTransition();
  const [busyDayId, setBusyDayId] = useState<string | null>(null);

  function createVariant() {
    if (!newNameAr || !newNameEn) return;
    const formData = new FormData();
    formData.set("name_ar", newNameAr);
    formData.set("name_en", newNameEn);
    startTransition(async () => {
      const result = await createNutritionVariantAction(locale, programId, formData);
      if ("error" in result) {
        toast.error(tErrors(result.error));
        return;
      }
      setNewNameAr("");
      setNewNameEn("");
      setCreating(false);
    });
  }

  function assignDay(dayId: string, dietPlanId: string) {
    setBusyDayId(dayId);
    startTransition(async () => {
      const result = await setDayNutritionAction(locale, programId, [dayId], dietPlanId || null);
      if (result?.error) toast.error(tErrors(result.error));
      setBusyDayId(null);
    });
  }

  function customizeDay(dayId: string) {
    setBusyDayId(dayId);
    startTransition(async () => {
      const result = await customizeDayNutritionAction(locale, programId, dayId);
      if ("error" in result) toast.error(tErrors(result.error));
      setBusyDayId(null);
    });
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("title")}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="size-4" />
          {t("newVariant")}
        </Button>
      </div>

      {creating && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-2">
          <Input value={newNameAr} onChange={(e) => setNewNameAr(e.target.value)} dir="rtl" placeholder={t("nameArPlaceholder")} />
          <Input value={newNameEn} onChange={(e) => setNewNameEn(e.target.value)} dir="ltr" placeholder={t("nameEnPlaceholder")} />
          <Button type="button" size="sm" disabled={pending || !newNameAr || !newNameEn} onClick={createVariant}>
            {t("create")}
          </Button>
        </div>
      )}

      {variants.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">{t("noVariants")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {variants.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/diets/${v.id}`} className="min-w-0 flex-1 truncate hover:underline">
                {pickLocale(v, locale)}
              </Link>
              {v.target_kcal != null && (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{t("kcal", { n: v.target_kcal })}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {days.length > 0 && variants.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <p className="text-xs font-medium text-muted-foreground">{t("assignByDay")}</p>
          {days.map((day) => (
            <div key={day.id} className="flex items-center gap-2">
              <span className="w-16 shrink-0 truncate text-xs text-muted-foreground">
                {day.label_ar || day.label_en ? pickLocale(day, locale, "label") : tBuilder("dayN", { n: day.day_index })}
              </span>
              <select
                value={day.diet_plan_id ?? ""}
                disabled={busyDayId === day.id}
                onChange={(e) => assignDay(day.id, e.target.value)}
                className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-base md:text-xs"
              >
                <option value="">{t("none")}</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {pickLocale(v, locale)}
                  </option>
                ))}
              </select>
              {day.diet_plan_id && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busyDayId === day.id}
                  onClick={() => customizeDay(day.id)}
                  title={t("customizeHint")}
                >
                  {t("customize")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
