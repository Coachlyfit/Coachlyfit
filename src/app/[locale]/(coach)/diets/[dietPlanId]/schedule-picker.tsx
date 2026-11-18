"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/appointments/shared";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { DietPlanDay, DietPlanScheduleRow } from "@/domain/nutrition/diet-plans.service";
import { setScheduleAction } from "../actions";

/** Sunday-based weekday numbers in the order the week reads in `locale`
 * (Saturday first in Arabic), same as the appointments schedule settings. */
const weekOrder = (locale: AppLocale) => (locale === "ar" ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]);

/** Weekday -> day. Only meaningful with 2+ days, so the page renders it
 * only then. "Automatic" leaves a weekday unmapped: the client sees the
 * plan's first training day. */
export function SchedulePicker({
  locale,
  dietPlanId,
  days,
  schedule,
}: {
  locale: AppLocale;
  dietPlanId: string;
  days: DietPlanDay[];
  schedule: DietPlanScheduleRow[];
}) {
  const t = useTranslations("diets.days.schedule");
  const tBuilder = useTranslations("programs.builder");
  const tErrors = useTranslations("diets.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Record<number, string>>(() =>
    Object.fromEntries(schedule.map((s) => [s.weekday, s.diet_plan_day_id]))
  );
  const dirty =
    weekOrder("en").some((wd) => (draft[wd] ?? "") !== (schedule.find((s) => s.weekday === wd)?.diet_plan_day_id ?? ""));

  function save() {
    startTransition(async () => {
      const payload = Object.fromEntries(weekOrder("en").map((wd) => [String(wd), draft[wd] || null]));
      const result = await setScheduleAction(locale, dietPlanId, payload);
      if (result?.error) toast.error(tErrors(result.error));
      else toast.success(t("saved"));
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
      <div>
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {weekOrder(locale).map((weekday) => (
          <div key={weekday} className="flex flex-col gap-1">
            <Label htmlFor={`schedule_${weekday}`} className="text-xs">
              {tBuilder(`weekdayShort.${weekday}`)}
            </Label>
            <NativeSelect
              id={`schedule_${weekday}`}
              value={draft[weekday] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [weekday]: e.target.value }))}
            >
              <option value="">{t("automatic")}</option>
              {days.map((day) => (
                <option key={day.id} value={day.id}>
                  {pickLocale(day, locale)}
                </option>
              ))}
            </NativeSelect>
          </div>
        ))}
      </div>
      <Button type="button" size="sm" className="self-start" disabled={pending || !dirty} onClick={save}>
        {pending ? tCommon("pending") : tCommon("save")}
      </Button>
    </section>
  );
}
