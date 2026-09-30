"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/date-picker";
import { Label } from "@/components/ui/label";
import type { BodyProfileFormInput } from "@/domain/nutrition/nutrition.schema";

export type BodyProfileValues = {
  height_cm: number | null;
  birth_date: string | null;
  sex: string | null;
  activity_level: string | null;
  goal: string | null;
};

const SEXES = ["male", "female"] as const;
const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very_active"] as const;
const GOALS = ["cut", "maintain", "bulk"] as const;

// Native <select> (same as the program builder's nutrition panel): short
// fixed option lists, and the OS picker is the better mobile experience.
const selectClass =
  "h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:text-sm dark:bg-input/30";

/** Height / birth date / sex / activity / goal — the stored inputs behind
 * the macro suggestion. Shared by the coach's suggestion dialog and the
 * client's own sheet; each passes its own server action as `save`. */
export function BodyProfileForm({
  initial,
  save,
  onSaved,
}: {
  initial: BodyProfileValues | null;
  save: (input: BodyProfileFormInput) => Promise<{ error: string } | void>;
  onSaved?: () => void;
}) {
  const t = useTranslations("nutrition");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({
    height_cm: initial?.height_cm?.toString() ?? "",
    birth_date: initial?.birth_date ?? "",
    sex: initial?.sex ?? "",
    activity_level: initial?.activity_level ?? "",
    goal: initial?.goal ?? "",
  });
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await save(values);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(t("bodyProfile.saved"));
      onSaved?.();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bp-height">{t("fields.height")}</Label>
        <Input
          id="bp-height"
          type="number"
          inputMode="decimal"
          min={100}
          max={250}
          value={values.height_cm}
          onChange={set("height_cm")}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bp-birth">{t("fields.birthDate")}</Label>
        <DatePicker id="bp-birth" value={values.birth_date} onChange={(v) => setValues((s) => ({ ...s, birth_date: v }))} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bp-sex">{t("fields.sex")}</Label>
        <select id="bp-sex" className={selectClass} value={values.sex} onChange={set("sex")}>
          <option value="">{t("bodyProfile.notSet")}</option>
          {SEXES.map((s) => (
            <option key={s} value={s}>
              {t(`sex.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bp-goal">{t("fields.goal")}</Label>
        <select id="bp-goal" className={selectClass} value={values.goal} onChange={set("goal")}>
          <option value="">{t("bodyProfile.notSet")}</option>
          {GOALS.map((g) => (
            <option key={g} value={g}>
              {t(`goal.${g}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label htmlFor="bp-activity">{t("fields.activityLevel")}</Label>
        <select id="bp-activity" className={selectClass} value={values.activity_level} onChange={set("activity_level")}>
          <option value="">{t("bodyProfile.notSet")}</option>
          {ACTIVITY_LEVELS.map((a) => (
            <option key={a} value={a}>
              {t(`activity.${a}`)}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="col-span-2">
        {pending ? tCommon("pending") : t("bodyProfile.save")}
      </Button>
    </form>
  );
}
