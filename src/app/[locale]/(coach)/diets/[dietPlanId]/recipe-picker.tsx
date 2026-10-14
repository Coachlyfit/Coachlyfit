"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Check, ChefHat, ExternalLink, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Link } from "@/i18n/navigation";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { toLatinDigits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { searchRecipesAction, type RecipeCardRow } from "../../library/recipes/actions";

/** The "Recipes" tab of a meal's add picker. Servings default to 1 and step
 * by 0.5; picking a recipe adds it with that many servings (editable inline
 * afterwards, like a food's quantity). Archived recipes never show here. */
export function RecipePicker({
  locale,
  addedIds,
  onSelect,
}: {
  locale: AppLocale;
  addedIds?: ReadonlySet<string>;
  onSelect: (recipe: RecipeCardRow, servings: number) => void;
}) {
  const t = useTranslations("recipes.picker");
  const tMacros = useTranslations("diets.macros");
  const tItem = useTranslations("diets.itemDialog");
  const [query, setQuery] = useState("");
  const [servingsText, setServingsText] = useState("1");
  const debounced = useDebouncedValue(query.trim(), 300);

  const servings = Number(toLatinDigits(servingsText).replace("٫", "."));
  const servingsValid = Number.isFinite(servings) && servings >= 0.1 && servings <= 100;

  const { data, isPending } = useQuery({
    queryKey: ["diets", "recipe-picker", debounced],
    queryFn: () => searchRecipesAction({ query: debounced, sort: "name", locale, pageSize: 50 }),
  });
  const recipes = data?.rows ?? [];

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-end gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="flex-1"
          autoFocus
        />
        <div className="flex w-20 flex-col gap-1">
          <Label htmlFor="recipe-picker-servings" className="text-xs text-muted-foreground">
            {t("servings")}
          </Label>
          <Input
            id="recipe-picker-servings"
            inputMode="decimal"
            value={servingsText}
            onChange={(e) => setServingsText(e.target.value)}
            onBlur={() => !servingsValid && setServingsText("1")}
            aria-invalid={!servingsValid || undefined}
            className="text-center font-mono tabular-nums"
          />
        </div>
      </div>

      <div className="flex max-h-72 w-full flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
        {isPending ? (
          <p className="p-3 text-center text-sm text-muted-foreground">{tItem("loading")}</p>
        ) : recipes.length === 0 ? (
          <p className="p-3 text-center text-sm text-muted-foreground">{debounced ? t("noResults") : t("none")}</p>
        ) : (
          recipes.map((recipe) => {
            const added = addedIds?.has(recipe.id);
            return (
              <button
                key={recipe.id}
                type="button"
                disabled={!servingsValid}
                onClick={() => onSelect(recipe, servings)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-start text-sm hover:bg-muted disabled:opacity-50",
                  added && "bg-primary/10"
                )}
              >
                {added ? (
                  <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <ChefHat className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{pickLocale(recipe, locale)}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground tabular-nums">
                    {t("perServing", { kcal: Math.round(recipe.kcal) })} · {tMacros("p")} {Math.round(recipe.protein_g)} ·{" "}
                    {tMacros("c")} {Math.round(recipe.carb_g)} · {tMacros("f")} {Math.round(recipe.fat_g)}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>

      <Link
        href="/library/recipes/new"
        target="_blank"
        className="flex items-center gap-1.5 self-start text-sm text-primary hover:underline"
      >
        <ExternalLink className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
        {t("create")}
      </Link>
    </div>
  );
}
