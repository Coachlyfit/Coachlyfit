"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Target } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MacroSummary } from "@/components/nutrition/macro-summary";
import { planMacros, planWarnings, type MacroTargets } from "@/domain/nutrition/macros";
import type { DietPlanTree } from "@/domain/nutrition/diet-plans.service";
import { dietTargetsSchema, type DietTargetsFormInput } from "../schemas";
import { updateDietTargetsAction } from "../actions";

const FIELDS = [
  ["target_kcal", "kcal", 10000],
  ["target_protein_g", "protein", 1000],
  ["target_carb_g", "carbs", 1000],
  ["target_fat_g", "fat", 1000],
] as const;

/** The builder's always-visible "where is this day at": totals vs targets,
 * inline target editing, and the planWarnings checks. Pure derived data
 * from the tree already on the page, same no-fetch rule as the old macro
 * sidebar it replaces. Sticky from sm up so it stays in view while the
 * coach scrolls meals; on phones it scrolls with the page, since each meal
 * carries its own totals line. */
export function DaySummary({
  locale,
  dietPlanId,
  meals,
  targets,
}: {
  locale: string;
  dietPlanId: string;
  meals: DietPlanTree["meals"];
  targets: MacroTargets;
}) {
  const t = useTranslations("diets.macros");
  const tWarn = useTranslations("diets.warnings");
  const tErrors = useTranslations("diets.errors");
  const tCommon = useTranslations("common");
  const hasTargets = targets.target_kcal != null;
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const itemsByMeal = meals.map((meal) => meal.meal_items.map((item) => ({ quantity: item.quantity, food: item.foods })));
  const totals = planMacros(itemsByMeal);
  const warnings = planWarnings(itemsByMeal, targets);
  const emptyMeals = warnings.filter((w) => w.code === "empty_meal").length;

  const { register, handleSubmit, control } = useForm<DietTargetsFormInput>({
    resolver: zodResolver(dietTargetsSchema),
    defaultValues: {
      target_kcal: targets.target_kcal ?? undefined,
      target_protein_g: targets.target_protein_g ?? undefined,
      target_carb_g: targets.target_carb_g ?? undefined,
      target_fat_g: targets.target_fat_g ?? undefined,
    },
  });
  const [p, c, f] = useWatch({ control, name: ["target_protein_g", "target_carb_g", "target_fat_g"] }).map(
    (v) => Number(v) || 0
  );
  const macroKcal = Math.round(p * 4 + c * 4 + f * 9);

  const onSubmit = handleSubmit((data) => {
    const formData = new FormData();
    for (const [name] of FIELDS) {
      if (data[name] != null && data[name] !== "") formData.set(name, String(data[name]));
    }
    startTransition(async () => {
      const result = await updateDietTargetsAction(locale, dietPlanId, formData);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      setEditing(false);
    });
  });

  const messages = [
    ...warnings.flatMap((w) => {
      if (w.code === "macro_kcal_mismatch") return [tWarn("macroKcalMismatch", { macroKcal: w.macroKcal, targetKcal: w.targetKcal })];
      if (w.code === "over_target") return [tWarn("overTarget", { delta: w.delta })];
      if (w.code === "under_target") return [tWarn("underTarget", { delta: -w.delta })];
      return [];
    }),
    ...(emptyMeals > 0 ? [tWarn("emptyMeals", { count: emptyMeals })] : []),
  ];

  return (
    <section className="z-20 flex flex-col gap-3 rounded-xl bg-card/95 p-4 ring-1 ring-foreground/10 backdrop-blur sm:sticky sm:top-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <Button type="button" variant={hasTargets || editing ? "ghost" : "outline"} size="sm" onClick={() => setEditing((v) => !v)}>
          <Target className="size-4" />
          {editing ? tCommon("cancel") : hasTargets ? t("editTargets") : t("setTargets")}
        </Button>
      </div>

      {editing ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FIELDS.map(([name, key, max]) => (
              <div key={name} className="flex flex-col gap-1">
                <Label htmlFor={name} className="text-xs">
                  {key === "kcal" ? t("kcal") : t("gramsOf", { macro: t(key) })}
                </Label>
                <Input id={name} type="number" inputMode="numeric" min={0} max={max} {...register(name)} />
              </div>
            ))}
          </div>
          {macroKcal > 0 && (
            <p className="text-xs text-muted-foreground">{t("macrosAddUpTo", { kcal: macroKcal })}</p>
          )}
          <Button type="submit" size="sm" disabled={pending} className="self-start">
            {pending ? tCommon("pending") : t("saveTargets")}
          </Button>
        </form>
      ) : (
        <MacroSummary totals={totals} targets={targets} />
      )}

      {!hasTargets && !editing && <p className="text-xs text-muted-foreground">{t("noTargetsHint")}</p>}

      {messages.length > 0 && (
        <ul className="flex flex-col gap-1">
          {messages.map((m) => (
            <li key={m} className="flex items-start gap-1.5 text-xs text-warning-tint-foreground">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              {m}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
