"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AppLocale } from "@/domain/locale";
import type { DietPlanTree } from "@/domain/nutrition/diet-plans.service";
import { addStarterMealsAction, copyMealAction, deleteMealAction, reorderMealsAction } from "../actions";
import { AddMealDialog } from "./add-meal-dialog";
import { DaySummary } from "./day-summary";
import { MealCard } from "./meal-card";

type Meal = DietPlanTree["meals"][number];
type MealChange = { type: "reorder"; ids: string[] } | { type: "remove"; id: string };

function applyChange(meals: Meal[], change: MealChange): Meal[] {
  if (change.type === "remove") return meals.filter((m) => m.id !== change.id);
  return change.ids.map((id) => meals.find((m) => m.id === id)).filter((m): m is Meal => !!m);
}

/** Single-column builder: day summary on top, then meals, each editing its
 * own foods inline (meal-card.tsx). Server data flows in as props and is
 * never copied into state — reorder/delete go through useOptimistic, which
 * falls back to the refreshed props once the action's revalidatePath lands
 * (or reverts on error), so there's no remount key to keep in sync. */
export function DietPlanBuilder({
  locale,
  tree,
  copyTargets,
}: {
  locale: AppLocale;
  tree: DietPlanTree;
  copyTargets: { id: string; name: string }[];
}) {
  const t = useTranslations("diets.builder");
  const tErrors = useTranslations("diets.errors");
  const [meals, applyOptimistic] = useOptimistic(tree.meals, applyChange);
  const [mealDialog, setMealDialog] = useState<{ meal?: Meal } | null>(null);
  const [pendingDeleteMeal, setPendingDeleteMeal] = useState<string | null>(null);
  const [starterPending, startStarter] = useTransition();
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function run(change: MealChange, call: () => Promise<{ error: string } | void>) {
    startTransition(async () => {
      applyOptimistic(change);
      const result = await call();
      if (result?.error) toast.error(tErrors(result.error));
    });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = meals.map((m) => m.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    run({ type: "reorder", ids }, () => reorderMealsAction(locale, tree.id, ids));
  }

  function copyMeal(mealId: string, targetId: string, targetName: string) {
    startTransition(async () => {
      const result = await copyMealAction(locale, tree.id, mealId, targetId);
      if (result?.error) toast.error(tErrors(result.error));
      else if (targetId !== tree.id) toast.success(t("copiedTo", { name: targetName }));
    });
  }

  function addStarterMeals() {
    startStarter(async () => {
      const result = await addStarterMealsAction(locale, tree.id);
      if (result?.error) toast.error(tErrors(result.error));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <DaySummary locale={locale} dietPlanId={tree.id} meals={meals} targets={tree} />

      {meals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-medium">{t("noMeals")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{t("noMealsHint")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={addStarterMeals} disabled={starterPending}>
                <Sparkles className="size-4" />
                {t("starterMeals")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setMealDialog({})}>
                <Plus className="size-4" />
                {t("addMeal")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={meals.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {meals.map((meal) => (
                  <MealCard
                    key={meal.id}
                    locale={locale}
                    dietPlanId={tree.id}
                    meal={meal}
                    copyTargets={copyTargets}
                    onEdit={() => setMealDialog({ meal })}
                    onDelete={() => setPendingDeleteMeal(meal.id)}
                    onCopy={(targetId, targetName) => copyMeal(meal.id, targetId, targetName)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <Button type="button" variant="outline" className="border-dashed" onClick={() => setMealDialog({})}>
            <Plus className="size-4" />
            {t("addMeal")}
          </Button>
        </>
      )}

      {mealDialog && (
        <AddMealDialog
          locale={locale}
          dietPlanId={tree.id}
          meal={mealDialog.meal}
          open={!!mealDialog}
          onOpenChange={(open) => !open && setMealDialog(null)}
        />
      )}
      <ConfirmDialog
        open={!!pendingDeleteMeal}
        onOpenChange={(open) => !open && setPendingDeleteMeal(null)}
        title={t("confirmDeleteMealTitle")}
        description={t("confirmDeleteMealBody")}
        confirmLabel={t("deleteMeal")}
        onConfirm={() => {
          const id = pendingDeleteMeal;
          setPendingDeleteMeal(null);
          if (id) run({ type: "remove", id }, () => deleteMealAction(locale, tree.id, id));
        }}
      />
    </div>
  );
}
