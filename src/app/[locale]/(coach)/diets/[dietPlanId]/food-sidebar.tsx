"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { FOOD_CATEGORIES } from "@/domain/library/taxonomy";
import type { DietPlanTree } from "@/domain/nutrition/diet-plans.service";
import { searchFoodsAction } from "../../library/actions";
import { MealItemDialog } from "./meal-item-dialog";
import type { PickedFood } from "./food-picker";

type Meal = DietPlanTree["meals"][number];

/** Native HTML5 drag-and-drop, not dnd-kit -- same reasoning as
 * programs/[programId]/exercise-sidebar.tsx's EXERCISE_DRAG_MIME: this
 * gesture (sidebar list -> a meal card in a different component tree)
 * would otherwise need a third DndContext nested around both the sidebar
 * and every meal card, for a feature this design already treats as simpler
 * than the program builder. */
export const FOOD_DRAG_MIME = "application/x-coachlyfit-food";

/** Inline click-to-add sidebar, mirroring ExerciseSidebar: search + food
 * category chips + a meal picker, click a food to open MealItemDialog
 * pre-filled via `initialFood`. */
export function FoodSidebar({
  locale,
  dietPlanId,
  meals,
}: {
  locale: AppLocale;
  dietPlanId: string;
  meals: Meal[];
}) {
  const t = useTranslations("diets.foodSidebar");
  const tBuilder = useTranslations("diets.builder");
  const tCategories = useTranslations("library.foodCategories");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [mealId, setMealId] = useState(meals[0]?.id ?? "");
  const [picked, setPicked] = useState<PickedFood | null>(null);
  const debounced = useDebouncedValue(query, 300);

  const { data, isPending } = useQuery({
    queryKey: ["diets", "food-sidebar", debounced, category],
    queryFn: () => searchFoodsAction({ query: debounced, source: "all", group: category ?? undefined, pageSize: 50 }),
  });
  const foods = data?.rows as PickedFood[] | undefined;

  if (meals.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold">{t("title")}</h3>
      <select
        value={mealId}
        onChange={(e) => setMealId(e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {meals.map((meal) => (
          <option key={meal.id} value={meal.id}>
            {meal.label_ar || meal.label_en ? pickLocale(meal, locale, "label") : tBuilder("untitledMeal")}
          </option>
        ))}
      </select>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} />
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setCategory(null)}
          className={`rounded-full px-2 py-0.5 text-xs ${
            category === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {t("allCategories")}
        </button>
        {FOOD_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full px-2 py-0.5 text-xs ${
              category === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {tCategories(c)}
          </button>
        ))}
      </div>
      <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {isPending && <p className="p-3 text-center text-sm text-muted-foreground">{t("loading")}</p>}
        {!isPending && foods?.length === 0 && (
          <p className="p-3 text-center text-sm text-muted-foreground">{t("noResults")}</p>
        )}
        {foods?.map((food) => (
          <button
            key={food.id}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(FOOD_DRAG_MIME, JSON.stringify(food));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => setPicked(food)}
            className="flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted active:cursor-grabbing"
          >
            <span className="min-w-0 flex-1 truncate">{pickLocale(food, locale)}</span>
          </button>
        ))}
      </div>

      {picked && mealId && (
        <MealItemDialog
          locale={locale}
          dietPlanId={dietPlanId}
          mealId={mealId}
          initialFood={picked}
          open={!!picked}
          onOpenChange={(open) => !open && setPicked(null)}
        />
      )}
    </div>
  );
}
