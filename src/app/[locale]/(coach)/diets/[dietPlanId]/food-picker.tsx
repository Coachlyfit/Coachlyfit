"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Check, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { FOOD_CATEGORIES } from "@/domain/library/taxonomy";
import { cn } from "@/lib/utils";
import { searchFoodsAction } from "../../library/actions";
import { FoodDialog } from "../../library/food-dialog";

export type PickedFood = {
  id: string;
  name_ar: string;
  name_en: string;
  category: string | null;
  serving_label: string;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
};

/** Reuses the library's existing search action, same as programs'
 * ExercisePicker reuses searchExercisesAction. Lives inside each meal's
 * "Add food" popover; `addedIds` ticks foods already added this session so
 * a coach adding several foods in a row can see what went in. */
export function FoodPicker({
  locale,
  addedIds,
  onSelect,
}: {
  locale: AppLocale;
  addedIds?: ReadonlySet<string>;
  onSelect: (food: PickedFood) => void;
}) {
  const t = useTranslations("diets.itemDialog");
  const tCategories = useTranslations("library.foodCategories");
  const tLibrary = useTranslations("library.food");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(query, 300);
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["diets", "food-picker", debounced, category],
    queryFn: () => searchFoodsAction({ query: debounced, source: "all", group: category ?? undefined, pageSize: 50 }),
  });
  const foods = data?.rows as PickedFood[] | undefined;

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="flex-1"
          autoFocus
        />
        <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          {tLibrary("add")}
        </Button>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {[null, ...FOOD_CATEGORIES].map((c) => (
          <button
            key={c ?? "all"}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs",
              category === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            {c ? tCategories(c) : t("allCategories")}
          </button>
        ))}
      </div>
      <div className="flex max-h-72 w-full flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
        {isPending && (
          <p className="p-3 text-center text-sm text-muted-foreground">{t("loading")}</p>
        )}
        {!isPending && foods?.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-3 text-center text-sm text-muted-foreground">
            <p>{t("noResults")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {tLibrary("add")}
            </Button>
          </div>
        )}
        {foods?.map((food) => (
          <button
            key={food.id}
            type="button"
            onClick={() => onSelect(food)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-start text-sm hover:bg-muted",
              addedIds?.has(food.id) && "bg-primary/10"
            )}
          >
            {addedIds?.has(food.id) ? (
              <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{pickLocale(food, locale)}</span>
              <span className="block text-xs text-muted-foreground">{food.serving_label}</span>
            </span>
            <Badge variant="secondary" className="font-mono tabular-nums">
              {Math.round(food.kcal)}
            </Badge>
          </button>
        ))}
      </div>

      <FoodDialog
        locale={locale}
        mode="create"
        hideTrigger
        open={creating}
        onOpenChange={setCreating}
        onSaved={(created) => {
          queryClient.invalidateQueries({ queryKey: ["diets", "food-picker"] });
          if (created) onSelect(created as unknown as PickedFood);
        }}
      />
    </div>
  );
}
