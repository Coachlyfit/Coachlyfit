"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, Pencil, Printer } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { DietPlanTree } from "@/domain/nutrition/diet-plans.service";
import {
  deleteDietPlanAction,
  deleteMealAction,
  deleteMealItemAction,
  reorderMealsAction,
  reorderMealItemsAction,
} from "../actions";
import { AddMealDialog } from "./add-meal-dialog";
import { MealItemDialog } from "./meal-item-dialog";
import { AssignDietTemplateDialog } from "./assign-diet-template-dialog";
import { FoodSidebar, FOOD_DRAG_MIME } from "./food-sidebar";
import { MacroSidebar } from "./macro-sidebar";
import { Link, useRouter } from "@/i18n/navigation";

type Meal = DietPlanTree["meals"][number];
type Item = Meal["meal_items"][number];

/** No week/read-only branching here -- unlike programs' SortableItem, a diet
 * plan has no progression concept, so every item is always fully editable
 * and always sits inside a DndContext. */
function SortableFoodItem({
  item,
  locale,
  onEdit,
  onDelete,
}: {
  item: Item;
  locale: AppLocale;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("diets.builder");
  const sortable = useSortable({ id: item.id });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-md border border-transparent px-3 py-2.5 hover:border-border hover:bg-muted/50 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="drag"
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{pickLocale(item.foods, locale)}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground tabular-nums">
            {t("quantityUnit", { quantity: item.quantity, unit: item.unit })}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground tabular-nums">
            {Math.round((item.foods?.kcal ?? 0) * item.quantity)}kcal
          </span>
        </div>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit}>
        <Pencil className="size-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function MealCard({
  locale,
  dietPlanId,
  meal,
  onEditMeal,
  onDeleteMeal,
}: {
  locale: AppLocale;
  dietPlanId: string;
  meal: Meal;
  onEditMeal: () => void;
  onDeleteMeal: () => void;
}) {
  const t = useTranslations("diets.builder");
  const tErrors = useTranslations("diets.errors");
  const router = useRouter();
  const [items, setItems] = useState(meal.meal_items);
  const [itemDialog, setItemDialog] = useState<{
    item?: Item;
    initialFood?: Item["foods"];
  } | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [, startTransition] = useTransition();

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData(FOOD_DRAG_MIME);
    if (!raw) return;
    try {
      setItemDialog({ initialFood: JSON.parse(raw) });
    } catch {
      // Malformed payload (not our drag source) -- ignore silently.
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = items.findIndex((i) => i.id === active.id);
    const toIndex = items.findIndex((i) => i.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    const previous = items;
    const reordered = [...items];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setItems(reordered);

    startTransition(async () => {
      const result = await reorderMealItemsAction(
        locale,
        dietPlanId,
        meal.id,
        reordered.map((i) => i.id)
      );
      if (result?.error) {
        toast.error(tErrors(result.error));
        // Revert to the pre-drag snapshot, not the (now-stale) meal.meal_items
        // prop -- this component never remounts on a server refresh.
        setItems(previous);
        router.refresh();
      }
    });
  }

  async function confirmDeleteItem() {
    if (!pendingDeleteItem) return;
    const result = await deleteMealItemAction(locale, dietPlanId, pendingDeleteItem);
    if (result?.error) toast.error(tErrors(result.error));
    setPendingDeleteItem(null);
  }

  return (
    <Card
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={() => setDragOver(true)}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={dragOver ? "ring-2 ring-primary" : undefined}
    >
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          {meal.label_ar || meal.label_en ? pickLocale(meal, locale, "label") : t("untitledMeal")}
          <span className="font-mono text-xs text-muted-foreground">({items.length})</span>
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setItemDialog({})}>
            <Plus className="size-4" />
            {t("addFood")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" />}>
              <Pencil className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEditMeal}>{t("editMeal")}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDeleteMeal}>
                {t("deleteMeal")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("noItems")}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1">
                {items.map((item) => (
                  <SortableFoodItem
                    key={item.id}
                    item={item}
                    locale={locale}
                    onEdit={() => setItemDialog({ item })}
                    onDelete={() => setPendingDeleteItem(item.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>

      {itemDialog && (
        <MealItemDialog
          locale={locale}
          dietPlanId={dietPlanId}
          mealId={meal.id}
          item={itemDialog.item}
          initialFood={itemDialog.initialFood}
          open={!!itemDialog}
          onOpenChange={(open) => !open && setItemDialog(null)}
        />
      )}
      <ConfirmDialog
        open={!!pendingDeleteItem}
        onOpenChange={(open) => !open && setPendingDeleteItem(null)}
        title={t("deleteMeal")}
        confirmLabel={t("deleteMeal")}
        onConfirm={confirmDeleteItem}
      />
    </Card>
  );
}

export function DietPlanBuilder({
  locale,
  tree,
  clients,
  isTemplate,
}: {
  locale: AppLocale;
  tree: DietPlanTree;
  clients: { id: string; display_name: string }[];
  isTemplate: boolean;
}) {
  const t = useTranslations("diets.builder");
  const tDiets = useTranslations("diets");
  const tPrint = useTranslations("print");
  const tErrors = useTranslations("diets.errors");
  const router = useRouter();
  const [meals, setMeals] = useState(tree.meals);
  const [mealDialog, setMealDialog] = useState<{ meal?: Meal } | null>(null);
  const [pendingDeleteMeal, setPendingDeleteMeal] = useState<string | null>(null);
  const [pendingDeletePlan, setPendingDeletePlan] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const [, startReorderTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = meals.findIndex((m) => m.id === active.id);
    const toIndex = meals.findIndex((m) => m.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    const previous = meals;
    const reordered = [...meals];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setMeals(reordered);

    startReorderTransition(async () => {
      const result = await reorderMealsAction(
        locale,
        tree.id,
        reordered.map((m) => m.id)
      );
      if (result?.error) {
        toast.error(tErrors(result.error));
        setMeals(previous);
        router.refresh();
      }
    });
  }

  async function confirmDeleteMeal() {
    if (!pendingDeleteMeal) return;
    const result = await deleteMealAction(locale, tree.id, pendingDeleteMeal);
    if (result?.error) toast.error(tErrors(result.error));
    setPendingDeleteMeal(null);
  }

  function confirmDeletePlan() {
    startDeleteTransition(async () => {
      const result = await deleteDietPlanAction(locale, tree.id);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      router.push("/diets");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isTemplate && <AssignDietTemplateDialog locale={locale} dietPlanId={tree.id} clients={clients} />}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/print/diet/${tree.id}`}
            target="_blank"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Printer className="size-4" />
            {tPrint("button")}
          </Link>
          <Button type="button" variant="outline" onClick={() => setMealDialog({})}>
            <Plus className="size-4" />
            {t("addMeal")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setPendingDeletePlan(true)}
          >
            <Trash2 className="size-4" />
            {tDiets("deletePlan")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          {meals.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">{t("noMeals")}</CardContent>
            </Card>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={meals.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-4">
                  {meals.map((meal) => (
                    <MealCard
                      key={meal.id}
                      locale={locale}
                      dietPlanId={tree.id}
                      meal={meal}
                      onEditMeal={() => setMealDialog({ meal })}
                      onDeleteMeal={() => setPendingDeleteMeal(meal.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
        <aside className="flex flex-col gap-4">
          <FoodSidebar locale={locale} dietPlanId={tree.id} meals={meals} />
          <MacroSidebar meals={meals} />
        </aside>
      </div>

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
        onConfirm={confirmDeleteMeal}
      />
      <ConfirmDialog
        open={pendingDeletePlan}
        onOpenChange={setPendingDeletePlan}
        title={tDiets("confirmDeletePlanTitle")}
        description={tDiets("confirmDeletePlanBody")}
        confirmLabel={tDiets("deletePlan")}
        onConfirm={confirmDeletePlan}
        pending={deletePending}
      />
    </div>
  );
}
