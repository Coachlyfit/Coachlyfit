"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Loader2, MoreHorizontal, Pencil, Plus, Trash2, ArrowLeftRight, ChefHat, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MacroLine } from "@/components/nutrition/macro-summary";
import { cn } from "@/lib/utils";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatServing, itemMacros, mealMacros } from "@/domain/nutrition/macros";
import { formatIngredientAmount, itemMacroFood } from "@/domain/recipes/recipe-nutrition";
import type { DietPlanTree } from "@/domain/nutrition/diet-plans.service";
import {
  addMealItemAction,
  addMealRecipeAction,
  deleteMealItemAction,
  reorderMealItemsAction,
  setItemQuantityAction,
} from "../actions";
import { FoodPicker, type PickedFood } from "./food-picker";
import { RecipePicker } from "./recipe-picker";
import type { RecipeCardRow } from "../../library/recipes/actions";

type Meal = DietPlanTree["meals"][number];
type Item = Meal["meal_items"][number];
type ItemChange =
  | { type: "add"; item: Item }
  | { type: "remove"; id: string }
  | { type: "quantity"; id: string; quantity: number }
  | { type: "reorder"; ids: string[] };

function applyChange(items: Item[], change: ItemChange): Item[] {
  switch (change.type) {
    case "add":
      return [...items, change.item];
    case "remove":
      return items.filter((i) => i.id !== change.id);
    case "quantity":
      return items.map((i) => (i.id === change.id ? { ...i, quantity: change.quantity } : i));
    case "reorder":
      return change.ids.map((id) => items.find((i) => i.id === id)).filter((i): i is Item => !!i);
  }
}

const isTemp = (id: string) => id.startsWith("temp-");

/** One food or recipe line. Quantity is edited in place: for a food it's a
 * multiple of the food's own serving (serving_label), which is what
 * macros.ts scales by — the second line spells out what that works out to
 * ("150g"); for a recipe it's the number of recipe servings, and the
 * ingredients can be expanded underneath. Commits on blur/Enter, Escape
 * reverts. Keyed by id+quantity from the parent, so a server-confirmed
 * value resets the draft. */
function FoodRow({
  item,
  locale,
  onQuantity,
  onRemove,
}: {
  item: Item;
  locale: AppLocale;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("diets.builder");
  const tMacros = useTranslations("diets.macros");
  const tRecipe = useTranslations("recipes.item");
  const temp = isTemp(item.id);
  const recipe = item.recipes;
  const [expanded, setExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: temp,
  });
  const [draft, setDraft] = useState(String(item.quantity));
  const parsed = Number(draft);
  const valid = draft !== "" && Number.isFinite(parsed) && parsed >= 0.1 && parsed <= 100;
  const quantity = valid ? parsed : item.quantity;
  const macros = itemMacros(quantity, itemMacroFood(item));
  const serving = item.foods?.serving_label ?? "";
  const name = pickLocale(item.foods ?? recipe, locale);
  const quantityLabel = recipe ? tRecipe("servingsOf", { name }) : t("servingsOf", { serving });

  function commit() {
    if (!valid) {
      setDraft(String(item.quantity));
      return;
    }
    if (parsed !== item.quantity) onQuantity(parsed);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-md hover:bg-muted/50", isDragging && "opacity-50", temp && "opacity-60")}
    >
    <div className="flex items-center gap-2 px-1 py-1.5">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t("dragFood")}
        className="hidden shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing sm:block"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {recipe && <ChefHat className="size-4 shrink-0 text-primary" aria-label={tRecipe("recipe")} />}
          <span className="truncate">{name}</span>
          {recipe?.archived_at && (
            <Badge variant="outline" className="shrink-0">
              {tRecipe("archived")}
            </Badge>
          )}
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground tabular-nums">
          {recipe ? tRecipe("servings", { count: quantity }) : formatServing(quantity, serving)} · {tMacros("p")}{" "}
          {Math.round(macros.protein_g)} · {tMacros("c")} {Math.round(macros.carb_g)} · {tMacros("f")}{" "}
          {Math.round(macros.fat_g)}
        </div>
      </div>
      {recipe && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`recipe-ingredients-${item.id}`}
          aria-label={expanded ? tRecipe("hideIngredients") : tRecipe("showIngredients")}
          className="shrink-0 text-muted-foreground"
        >
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </Button>
      )}
      <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <span aria-hidden="true">×</span>
        <Input
          type="number"
          inputMode="decimal"
          step={recipe ? "0.5" : "0.25"}
          min={0.1}
          max={100}
          value={draft}
          disabled={temp}
          aria-label={quantityLabel}
          title={quantityLabel}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setDraft(String(item.quantity));
          }}
          className={cn("h-8 w-16 px-1.5 text-center font-mono", !valid && "border-destructive")}
        />
      </label>
      <span className="w-11 shrink-0 text-end font-mono text-sm tabular-nums">{Math.round(macros.kcal)}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={temp}
        onClick={onRemove}
        aria-label={recipe ? tRecipe("remove") : t("removeFood")}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
    {recipe && expanded && (
      <ul id={`recipe-ingredients-${item.id}`} className="flex flex-col gap-0.5 pb-2 ps-10 pe-2 text-xs text-muted-foreground">
        {recipe.recipe_ingredients.map((ingredient) => (
          <li key={ingredient.id} className="flex gap-2">
            <span className="w-20 shrink-0 font-mono tabular-nums">
              {formatIngredientAmount(
                ingredient.quantity,
                ingredient.unit,
                ingredient.foods?.serving_label,
                quantity / recipe.servings
              )}
            </span>
            <span className="min-w-0 truncate">
              {pickLocale(ingredient.foods, locale)}
              {ingredient.note && <span className="ms-1">({ingredient.note})</span>}
            </span>
          </li>
        ))}
      </ul>
    )}
    </div>
  );
}

export function MealCard({
  locale,
  dietPlanId,
  meal,
  copyTargets,
  onEdit,
  onDelete,
  onCopy,
}: {
  locale: AppLocale;
  dietPlanId: string;
  meal: Meal;
  /** Sibling nutrition variants a meal can be copied into (program-owned
   * plans only; empty for a standalone plan). */
  copyTargets: { id: string; name: string }[];
  onEdit: () => void;
  onDelete: () => void;
  onCopy: (targetPlanId: string, targetName: string) => void;
}) {
  const t = useTranslations("diets.builder");
  const tErrors = useTranslations("diets.errors");
  const tPicker = useTranslations("recipes.picker");
  const [items, applyOptimistic] = useOptimistic(meal.meal_items, applyChange);
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [addedIds, setAddedIds] = useState<ReadonlySet<string>>(new Set());
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: meal.id });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const totals = mealMacros(items.map((i) => ({ quantity: i.quantity, food: itemMacroFood(i) })));
  const label = meal.label_ar || meal.label_en ? pickLocale(meal, locale, "label") : t("untitledMeal");

  function run(change: ItemChange, call: () => Promise<{ error: string } | void>) {
    startTransition(async () => {
      applyOptimistic(change);
      const result = await call();
      if (result?.error) toast.error(tErrors(result.error));
    });
  }

  function addFood(food: PickedFood) {
    setAddedIds((prev) => new Set(prev).add(food.id));
    const unit = (food.serving_label || "serving").slice(0, 30);
    const formData = new FormData();
    formData.set("food_id", food.id);
    formData.set("quantity", "1");
    formData.set("unit", unit);
    run(
      {
        type: "add",
        item: {
          id: `temp-${crypto.randomUUID()}`,
          coach_id: meal.coach_id,
          client_id: meal.client_id,
          created_by: null, // server trigger stamps the real value
          meal_id: meal.id,
          food_id: food.id,
          recipe_id: null,
          quantity: 1,
          unit,
          order_index: items.length,
          foods: { ...food, category: food.category ?? "" },
          recipes: null,
        },
      },
      () => addMealItemAction(locale, dietPlanId, meal.id, formData)
    );
  }

  // Not optimistic: a recipe row needs its ingredients to show macros, and
  // those arrive with the revalidated tree. The meal header shows pending.
  function addRecipe(recipe: RecipeCardRow, servings: number) {
    setAddedIds((prev) => new Set(prev).add(recipe.id));
    startTransition(async () => {
      const result = await addMealRecipeAction(locale, dietPlanId, meal.id, recipe.id, servings);
      if (result?.error) toast.error(tErrors(result.error));
    });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || items.some((i) => isTemp(i.id))) return;
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    run({ type: "reorder", ids }, () => reorderMealItemsAction(locale, dietPlanId, meal.id, ids));
  }

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("gap-0 py-0", isDragging && "z-10 opacity-70")}
    >
      <div className="flex items-start gap-2 p-3 pb-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("dragMeal")}
          className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-start">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{label}</span>
            {meal.time_of_day && (
              <Badge variant="outline" className="shrink-0 font-mono tabular-nums">
                {meal.time_of_day.slice(0, 5)}
              </Badge>
            )}
            {pending && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
          </span>
          <MacroLine totals={totals} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("mealActions")} />}>
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="size-4" />
              {t("editMeal")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCopy(dietPlanId, label)}>
              <Copy className="size-4" />
              {t("duplicateMeal")}
            </DropdownMenuItem>
            {copyTargets.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ArrowLeftRight className="size-4" />
                  {t("copyTo")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {copyTargets.map((target) => (
                    <DropdownMenuItem key={target.id} onClick={() => onCopy(target.id, target.name)}>
                      {target.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4" />
              {t("deleteMeal")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="px-2">
        {items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">{t("noItems")}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col">
                {items.map((item) => (
                  <FoodRow
                    key={`${item.id}:${item.quantity}`}
                    item={item}
                    locale={locale}
                    onQuantity={(quantity) =>
                      run({ type: "quantity", id: item.id, quantity }, () =>
                        setItemQuantityAction(locale, dietPlanId, item.id, quantity)
                      )
                    }
                    onRemove={() =>
                      run({ type: "remove", id: item.id }, () => deleteMealItemAction(locale, dietPlanId, item.id))
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="p-2 pt-1">
        <Popover
          open={addOpen}
          onOpenChange={(open) => {
            setAddOpen(open);
            if (!open) setAddedIds(new Set());
          }}
        >
          <PopoverTrigger
            render={
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" />
            }
          >
            <Plus className="size-4" />
            {t("addFood")}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-96">
            <Tabs defaultValue="foods" className="gap-2">
              <TabsList className="w-full">
                <TabsTrigger value="foods" className="flex-1">
                  {tPicker("foods")}
                </TabsTrigger>
                <TabsTrigger value="recipes" className="flex-1">
                  <ChefHat className="size-4" aria-hidden="true" />
                  {tPicker("recipes")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="foods">
                <FoodPicker locale={locale} addedIds={addedIds} onSelect={addFood} />
              </TabsContent>
              <TabsContent value="recipes">
                <RecipePicker locale={locale} addedIds={addedIds} onSelect={addRecipe} />
              </TabsContent>
            </Tabs>
          </PopoverContent>
        </Popover>
      </div>
    </Card>
  );
}
