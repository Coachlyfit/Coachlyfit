"use client";

import { useState, type Ref } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { RecipeIngredientFood } from "@/domain/recipes/recipes.service";
import { searchFoodsAction } from "../actions";

/** Bolds the first case-insensitive occurrence of `query` in `text`. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-primary/15 px-0.5 font-semibold text-foreground">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

/** Picks a food for one ingredient row. Searches the coach's own and the
 * global foods (searchFoodsAction, the same visibility as the library), by
 * Arabic or English name. "Create" hands the typed text to the parent,
 * which opens the existing FoodDialog. */
export function FoodCombobox({
  id,
  locale,
  food,
  onSelect,
  onCreate,
  invalid,
  describedBy,
  triggerRef,
}: {
  id: string;
  locale: AppLocale;
  food: RecipeIngredientFood | undefined;
  onSelect: (food: RecipeIngredientFood) => void;
  onCreate: (query: string) => void;
  invalid?: boolean;
  describedBy?: string;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  const t = useTranslations("recipes.form");
  const tMacros = useTranslations("diets.macros");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);

  const { data, isPending, isFetching } = useQuery({
    queryKey: ["recipes", "food-search", debounced],
    queryFn: () => searchFoodsAction({ query: debounced, source: "all", pageSize: 30 }),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const foods = (data?.rows ?? []) as RecipeIngredientFood[];
  const typed = query.trim();

  function create(text: string) {
    setOpen(false);
    onCreate(text);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        ref={triggerRef}
        render={
          <Button
            type="button"
            variant="outline"
            id={id}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className="w-full min-w-0 justify-between font-normal"
          />
        }
      >
        <span className={food ? "truncate" : "truncate text-muted-foreground"}>
          {food ? pickLocale(food, locale) : t("chooseFood")}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={t("searchFoods")} aria-label={t("searchFoods")} />
          <CommandList aria-busy={isFetching}>
            {isPending ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("searching")}</p>
            ) : (
              <CommandEmpty>{t("noFoods")}</CommandEmpty>
            )}
            <CommandGroup>
              {foods.map((f) => {
                const other = locale === "ar" ? f.name_en : f.name_ar;
                return (
                  <CommandItem
                    key={f.id}
                    value={f.id}
                    onSelect={() => {
                      onSelect(f);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">
                        <Highlight text={pickLocale(f, locale)} query={typed} />
                        {other && other !== pickLocale(f, locale) && (
                          <span className="ms-1.5 text-xs text-muted-foreground">
                            <Highlight text={other} query={typed} />
                          </span>
                        )}
                      </span>
                      <span className="truncate font-mono text-xs text-muted-foreground tabular-nums">
                        {f.serving_label} · {Math.round(f.kcal)} {tMacros("kcal")} · {tMacros("p")} {Math.round(f.protein_g)} ·{" "}
                        {tMacros("c")} {Math.round(f.carb_g)} · {tMacros("f")} {Math.round(f.fat_g)}
                      </span>
                    </span>
                  </CommandItem>
                );
              })}
              {typed && !isPending && (
                <CommandItem value="__create__" onSelect={() => create(typed)} className="text-primary">
                  <Plus className="size-4" aria-hidden="true" />
                  {t("createFood", { query: typed })}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
          <div className="border-t p-1">
            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => create(typed)}>
              <Plus className="size-4" aria-hidden="true" />
              {t("createFoodPlain")}
            </Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
