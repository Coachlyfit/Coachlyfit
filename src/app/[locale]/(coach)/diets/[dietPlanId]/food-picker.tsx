"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { searchFoodsAction } from "../../library/actions";
import { FoodDialog } from "../../library/food-dialog";

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
  const tLibrary = useTranslations("library.food");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(query, 300);
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["diets", "food-picker", debounced],
    queryFn: () => searchFoodsAction({ query: debounced, source: "all", pageSize: 50 }),
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
        />
        <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          {tLibrary("add")}
        </Button>
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

      <FoodDialog
        locale={locale}
        mode="create"
        hideTrigger
        open={creating}
        onOpenChange={setCreating}
        onSaved={(created) => {
          queryClient.invalidateQueries({ queryKey: ["diets", "food-picker"] });
          queryClient.invalidateQueries({ queryKey: ["diets", "food-sidebar"] });
          if (created) onSelect(created as unknown as PickedFood);
        }}
      />
    </div>
  );
}
