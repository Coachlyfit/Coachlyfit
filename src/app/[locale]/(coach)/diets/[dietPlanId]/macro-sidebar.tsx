"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { planMacros, macroPercentages, targetDelta } from "@/domain/nutrition/macros";
import type { DietPlanTree } from "@/domain/nutrition/diet-plans.service";
import { dietTargetsSchema, type DietTargetsFormInput } from "../schemas";
import { updateDietTargetsAction } from "../actions";

type Targets = Pick<DietPlanTree, "target_kcal" | "target_protein_g" | "target_carb_g" | "target_fat_g">;

/** Sums kcal/protein/carb/fat across all meals -- pure derived data from
 * the already-loaded tree, no fetch of its own. Mirrors
 * programs/[programId]/volume-sidebar.tsx's "no separate fetch" pattern,
 * using the already-tested macros.ts functions instead of a new one.
 *
 * Targets (target_kcal/target_protein_g/target_carb_g/target_fat_g) are
 * optional and independent of meals -- a coach can set them on a variant
 * before adding a single food, e.g. "Training day: 2800 kcal" as a plan
 * outline before filling in meals. When set, actual-vs-target bars replace
 * the plain totals. */
export function MacroSidebar({
  locale,
  dietPlanId,
  meals,
  targets,
}: {
  locale: string;
  dietPlanId: string;
  meals: DietPlanTree["meals"];
  targets: Targets;
}) {
  const t = useTranslations("diets.macros");
  const tErrors = useTranslations("diets.errors");
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const totals = planMacros(meals.map((meal) => meal.meal_items.map((item) => ({ quantity: item.quantity, food: item.foods }))));
  const percentages = macroPercentages(totals);
  const hasFood = meals.some((meal) => meal.meal_items.length > 0);
  const hasTargets = targets.target_kcal != null;
  const delta = targetDelta(totals, targets);

  const { register, handleSubmit } = useForm<DietTargetsFormInput>({
    resolver: zodResolver(dietTargetsSchema),
    defaultValues: {
      target_kcal: targets.target_kcal ?? undefined,
      target_protein_g: targets.target_protein_g ?? undefined,
      target_carb_g: targets.target_carb_g ?? undefined,
      target_fat_g: targets.target_fat_g ?? undefined,
    },
  });

  const onSubmit = handleSubmit((data) => {
    const formData = new FormData();
    if (data.target_kcal != null) formData.set("target_kcal", String(data.target_kcal));
    if (data.target_protein_g != null) formData.set("target_protein_g", String(data.target_protein_g));
    if (data.target_carb_g != null) formData.set("target_carb_g", String(data.target_carb_g));
    if (data.target_fat_g != null) formData.set("target_fat_g", String(data.target_fat_g));

    startTransition(async () => {
      const result = await updateDietTargetsAction(locale, dietPlanId, formData);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      setEditing(false);
    });
  });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("title")}</h3>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setEditing((v) => !v)}>
          <Pencil className="size-4" />
        </Button>
      </div>

      {editing && (
        <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-md border border-border p-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="target_kcal" className="text-xs">
                {t("kcal")}
              </Label>
              <Input id="target_kcal" type="number" min={1} max={10000} {...register("target_kcal")} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="target_protein_g" className="text-xs">
                {t("protein")}
              </Label>
              <Input id="target_protein_g" type="number" min={0} max={1000} {...register("target_protein_g")} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="target_carb_g" className="text-xs">
                {t("carbs")}
              </Label>
              <Input id="target_carb_g" type="number" min={0} max={1000} {...register("target_carb_g")} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="target_fat_g" className="text-xs">
                {t("fat")}
              </Label>
              <Input id="target_fat_g" type="number" min={0} max={1000} {...register("target_fat_g")} />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {t("saveTargets")}
          </Button>
        </form>
      )}

      {!hasFood && !hasTargets ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-2xl font-semibold tabular-nums">{Math.round(totals.kcal)}</span>
            {targets.target_kcal != null && (
              <span className="font-mono text-sm text-muted-foreground">/ {targets.target_kcal}</span>
            )}
            <span className="text-xs text-muted-foreground">{t("kcal")}</span>
            {delta.kcal != null && (
              <span className={cn("ms-auto text-xs font-mono", delta.kcal > 0 ? "text-destructive" : "text-muted-foreground")}>
                {delta.kcal > 0 ? "+" : ""}
                {delta.kcal}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5 text-xs">
            {(
              [
                ["protein", totals.protein_g, targets.target_protein_g, percentages.proteinPercent, delta.protein_g],
                ["carbs", totals.carb_g, targets.target_carb_g, percentages.carbPercent, delta.carb_g],
                ["fat", totals.fat_g, targets.target_fat_g, percentages.fatPercent, delta.fat_g],
              ] as const
            ).map(([key, actual, target, percent, d]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t(key)} · {percent}%
                </span>
                <span className="font-mono tabular-nums">
                  {actual}g{target != null && ` / ${target}g`}
                  {d != null && (
                    <span className={cn("ms-1", d > 0 ? "text-destructive" : "text-muted-foreground")}>
                      ({d > 0 ? "+" : ""}
                      {d})
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
