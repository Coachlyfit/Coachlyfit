"use client";

import { useEffect, useRef } from "react";
import { Controller, useFieldArray, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import { allowedUnits, servingFactor, type IngredientUnit } from "@/domain/recipes/recipe-nutrition";
import { ingredientQuantitySchema } from "@/domain/recipes/recipe.schema";
import type { RecipeIngredientFood } from "@/domain/recipes/recipes.service";
import { FoodCombobox } from "./food-combobox";
import type { RecipeFormApi, RecipeFormValues } from "./recipe-form";

export const EMPTY_INGREDIENT = { food_id: "", quantity: "", unit: "serving" as IngredientUnit, note: "" };

/** The typed quantity as a number, or null while it isn't valid yet. */
export function parseQuantity(value: string): number | null {
  const parsed = ingredientQuantitySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

type Props = {
  form: RecipeFormApi;
  locale: AppLocale;
  foods: ReadonlyMap<string, RecipeIngredientFood>;
  onFoodPicked: (food: RecipeIngredientFood) => void;
  onCreateFood: (index: number, query: string) => void;
};

export function IngredientsField({ form, locale, foods, onFoodPicked, onCreateFood }: Props) {
  const t = useTranslations("recipes.form");
  const tErrors = useTranslations("recipes.errors");
  const { control, formState } = form;
  const { fields, append, remove, move } = useFieldArray({ control, name: "ingredients" });
  const rows = useWatch({ control, name: "ingredients" });
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const focusIndex = useRef<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // A row added from the keyboard (Enter in a quantity) gets its food
  // picker focused once it has rendered.
  useEffect(() => {
    if (focusIndex.current == null) return;
    const field = fields[focusIndex.current];
    focusIndex.current = null;
    if (field) triggers.current.get(field.id)?.focus();
  }, [fields]);

  function addRow() {
    focusIndex.current = fields.length;
    append({ ...EMPTY_INGREDIENT }, { shouldFocus: false });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((f) => f.id === active.id);
    const to = fields.findIndex((f) => f.id === over.id);
    if (from !== -1 && to !== -1) move(from, to);
  }

  const rootError = formState.errors.ingredients?.root?.message ?? formState.errors.ingredients?.message;

  return (
    <div className="flex flex-col gap-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2">
            {fields.map((field, index) => (
              <IngredientRow
                key={field.id}
                fieldId={field.id}
                index={index}
                form={form}
                locale={locale}
                foods={foods}
                rows={rows}
                registerTrigger={(el) => {
                  if (el) triggers.current.set(field.id, el);
                  else triggers.current.delete(field.id);
                }}
                onFoodPicked={onFoodPicked}
                onCreateFood={(query) => onCreateFood(index, query)}
                onEnter={addRow}
                onRemove={() => remove(index)}
                onMerge={(into) => {
                  const a = parseQuantity(rows[into]?.quantity ?? "") ?? 0;
                  const b = parseQuantity(rows[index]?.quantity ?? "") ?? 0;
                  form.setValue(`ingredients.${into}.quantity`, String(Math.round((a + b) * 100) / 100), {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  remove(index);
                }}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {rootError && (
        <p role="alert" className="text-sm text-destructive">
          {tErrors.has(rootError) ? tErrors(rootError) : tErrors("invalid_input")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={fields.length >= 40}>
          <Plus className="size-4" aria-hidden="true" />
          {t("addIngredient")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("ingredientsHint")}</p>
      </div>
    </div>
  );
}

function IngredientRow({
  fieldId,
  index,
  form,
  locale,
  foods,
  rows,
  registerTrigger,
  onFoodPicked,
  onCreateFood,
  onEnter,
  onRemove,
  onMerge,
}: {
  fieldId: string;
  index: number;
  form: RecipeFormApi;
  locale: AppLocale;
  foods: ReadonlyMap<string, RecipeIngredientFood>;
  rows: RecipeFormValues["ingredients"];
  registerTrigger: (el: HTMLButtonElement | null) => void;
  onFoodPicked: (food: RecipeIngredientFood) => void;
  onCreateFood: (query: string) => void;
  onEnter: () => void;
  onRemove: () => void;
  onMerge: (into: number) => void;
}) {
  const t = useTranslations("recipes.form");
  const tErrors = useTranslations("recipes.errors");
  const tMacros = useTranslations("diets.macros");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fieldId });
  const { control, register, setValue, formState } = form;

  const row = rows[index] ?? EMPTY_INGREDIENT;
  const food = row.food_id ? foods.get(row.food_id) : undefined;
  const units = allowedUnits(food?.serving_label);
  const quantity = parseQuantity(row.quantity);
  const factor = food && quantity != null ? servingFactor(quantity, row.unit, food.serving_label) : null;
  const kcal = food && factor != null ? food.kcal * factor : null;
  const unitMismatch = !!food && row.unit !== "serving" && !units.includes(row.unit);
  const duplicateOf = row.food_id ? rows.findIndex((r, i) => i < index && r.food_id === row.food_id) : -1;
  const canMerge = duplicateOf !== -1 && rows[duplicateOf]?.unit === row.unit;

  const rowErrors = formState.errors.ingredients?.[index];
  const errorKey =
    rowErrors?.food_id?.message ?? rowErrors?.quantity?.message ?? rowErrors?.unit?.message ?? rowErrors?.note?.message;
  const errorId = `ingredient-${fieldId}-error`;
  const label = t("ingredientN", { n: index + 1 });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-lg border bg-card p-2", isDragging && "z-10 opacity-70 shadow-md")}
      aria-label={label}
    >
      <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("dragIngredient")}
          className="mt-3 shrink-0 cursor-grab touch-none rounded text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>

        <div className="min-w-0 flex-1 basis-[calc(100%-2rem)] sm:basis-auto">
          <label htmlFor={`ingredient-${fieldId}-food`} className="sr-only">
            {t("food")}
          </label>
          <Controller
            control={control}
            name={`ingredients.${index}.food_id`}
            render={({ field }) => (
              <FoodCombobox
                id={`ingredient-${fieldId}-food`}
                locale={locale}
                food={food}
                invalid={!!rowErrors?.food_id}
                describedBy={errorKey ? errorId : undefined}
                triggerRef={(el) => {
                  field.ref(el);
                  registerTrigger(el);
                }}
                onCreate={onCreateFood}
                onSelect={(picked) => {
                  onFoodPicked(picked);
                  field.onChange(picked.id);
                  // Gram/ml entry is what coaches type when the food allows it.
                  const next = allowedUnits(picked.serving_label);
                  setValue(`ingredients.${index}.unit`, next[next.length - 1], { shouldDirty: true });
                  form.setFocus(`ingredients.${index}.quantity`);
                }}
              />
            )}
          />
        </div>

        <div className="flex flex-1 flex-wrap items-start gap-2 ps-6 sm:flex-none sm:flex-nowrap sm:ps-0">
          <div className="w-24">
            <label htmlFor={`ingredient-${fieldId}-qty`} className="sr-only">
              {t("quantity")}
            </label>
            <Input
              id={`ingredient-${fieldId}-qty`}
              inputMode="decimal"
              autoComplete="off"
              placeholder={t("quantity")}
              aria-invalid={!!rowErrors?.quantity || undefined}
              aria-describedby={errorKey ? errorId : undefined}
              className="font-mono tabular-nums"
              {...register(`ingredients.${index}.quantity`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onEnter();
                }
              }}
            />
          </div>

          <Controller
            control={control}
            name={`ingredients.${index}.unit`}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => v && field.onChange(v)}
                items={units.map((u) => ({
                  value: u,
                  label: u === "serving" ? t("units.serving", { label: food?.serving_label ?? "" }) : t(`units.${u}`),
                }))}
              >
                <SelectTrigger
                  aria-label={t("unit")}
                  aria-invalid={!!rowErrors?.unit || unitMismatch || undefined}
                  className="w-28"
                  disabled={!food}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u === "serving" ? t("units.serving", { label: food?.serving_label ?? "" }) : t(`units.${u}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />

          <div className="min-w-24 flex-1 sm:w-32 sm:flex-none">
            <label htmlFor={`ingredient-${fieldId}-note`} className="sr-only">
              {t("note")}
            </label>
            <Input
              id={`ingredient-${fieldId}-note`}
              placeholder={t("notePlaceholder")}
              maxLength={60}
              aria-invalid={!!rowErrors?.note || undefined}
              {...register(`ingredients.${index}.note`)}
            />
          </div>

          <span className="mt-2.5 w-16 shrink-0 text-end font-mono text-sm tabular-nums" aria-live="polite">
            {kcal != null ? `${Math.round(kcal)}` : "—"}
            <span className="ms-0.5 text-xs text-muted-foreground">{tMacros("kcal")}</span>
          </span>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={t("removeIngredient")}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {errorKey && (
        <p id={errorId} className="mt-1.5 ps-6 text-sm text-destructive">
          {tErrors.has(errorKey) ? tErrors(errorKey) : tErrors("invalid_input")}
        </p>
      )}
      {unitMismatch && !errorKey && (
        <p className="mt-1.5 flex items-center gap-1.5 ps-6 text-sm text-warning-tint-foreground">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {t("unitMismatch")}
        </p>
      )}
      {duplicateOf !== -1 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-2 ps-6 text-sm text-muted-foreground">
          <AlertTriangle className="size-4 shrink-0 text-warning-tint-foreground" aria-hidden="true" />
          {t("duplicateWarning")}
          {canMerge && (
            <Button type="button" variant="outline" size="xs" onClick={() => onMerge(duplicateOf)}>
              {t("merge")}
            </Button>
          )}
        </p>
      )}
    </li>
  );
}
