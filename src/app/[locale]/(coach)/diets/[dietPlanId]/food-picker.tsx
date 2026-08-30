"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { searchFoodsAction } from "../../library/actions";

export type PickedFood = {
  id: string;
  name_ar: string;
  name_en: string;
  category: string | null;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
};

/** Reuses the library's existing search action, same as programs'
 * ExercisePicker reuses searchExercisesAction. */
export function FoodPicker({
  locale,
  selectedId,
  onSelect,
}: {
  locale: AppLocale;
  selectedId: string | null;
  onSelect: (food: PickedFood) => void;
}) {
  const t = useTranslations("diets.itemDialog");
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);

  const { data, isPending } = useQuery({
    queryKey: ["diets", "food-picker", debounced],
    queryFn: () => searchFoodsAction({ query: debounced, source: "all", pageSize: 50 }),
  });
  const foods = data?.rows as PickedFood[] | undefined;

  return (
    <div className="flex w-full flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
      />
      <div className="flex max-h-72 w-full flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
        {isPending && (
          <p className="p-3 text-center text-sm text-muted-foreground">{t("loading")}</p>
        )}
        {!isPending && foods?.length === 0 && (
          <p className="p-3 text-center text-sm text-muted-foreground">{t("noResults")}</p>
        )}
        {foods?.map((food) => (
          <button
            key={food.id}
            type="button"
            onClick={() => onSelect(food)}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm hover:bg-muted ${
              selectedId === food.id ? "bg-primary/10 text-primary" : ""
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{pickLocale(food, locale)}</span>
            <Badge variant="secondary" className="font-mono tabular-nums">
              {food.kcal}kcal
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}
