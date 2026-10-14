"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch, type FieldErrors, type Resolver, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link, useRouter } from "@/i18n/navigation";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import type { AppLocale } from "@/domain/locale";
import { recipeSchema, type RecipeInput } from "@/domain/recipes/recipe.schema";
import { allowedUnits, calculateRecipeNutrition, type IngredientUnit } from "@/domain/recipes/recipe-nutrition";
import type { RecipeIngredientFood } from "@/domain/recipes/recipes.service";
import { FoodDialog } from "../food-dialog";
import { saveRecipeAction } from "./actions";
import { EMPTY_INGREDIENT, IngredientsField, parseQuantity } from "./ingredients-field";
import { StepsField } from "./steps-field";
import { TagsInput } from "./tags-input";
import { ImageField } from "./image-field";
import { VideoPreview } from "@/components/recipes/video-preview";
import { NutritionBar, NutritionPanel } from "./nutrition-panel";

export type RecipeFormValues = {
  name_ar: string;
  name_en: string;
  description: string;
  servings: string;
  prep_minutes: string;
  cook_minutes: string;
  ingredients: { food_id: string; quantity: string; unit: IngredientUnit; note: string }[];
  steps: { text: string }[];
  tags: string[];
  video_url: string;
  image_path: string;
};

export type RecipeFormApi = UseFormReturn<RecipeFormValues, unknown, RecipeInput>;

export type RecipeFormInitial = {
  id: string;
  values: RecipeFormValues;
  foods: RecipeIngredientFood[];
  imageUrl: string | null;
  /** Live plans using this recipe, for the "applies everywhere" confirm. */
  planCount: number;
};

const EMPTY_VALUES: RecipeFormValues = {
  name_ar: "",
  name_en: "",
  description: "",
  servings: "1",
  prep_minutes: "",
  cook_minutes: "",
  ingredients: [{ ...EMPTY_INGREDIENT }],
  steps: [{ text: "" }],
  tags: [],
  video_url: "",
  image_path: "",
};

const ARABIC = /[؀-ۿ]/;

/** Leaf error messages anywhere in the tree, for the "N fields" summary. */
function countErrors(errors: unknown): number {
  if (!errors || typeof errors !== "object") return 0;
  if ("message" in errors && typeof errors.message === "string") return 1;
  return Object.entries(errors).reduce((n, [key, value]) => (key === "ref" ? n : n + countErrors(value)), 0);
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="scroll-mt-20">
      <Card className="gap-4 px-4 sm:px-5">
        <h2 id={id ? `${id}-title` : undefined} className="font-semibold">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  const tErrors = useTranslations("recipes.errors");
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {tErrors.has(message) ? tErrors(message) : tErrors("invalid_input")}
    </p>
  );
}

/** Create or edit a recipe. One shared zod schema validates here and again
 * in saveRecipeAction. Macros are recalculated on every change from the
 * picked foods (calculateRecipeNutrition, the same formula the
 * recipes_with_macros view uses). Input is never reset on a failed save. */
export function RecipeForm({
  locale,
  coachId,
  initial,
}: {
  locale: AppLocale;
  coachId: string;
  initial: RecipeFormInitial | null;
}) {
  const t = useTranslations("recipes");
  const tForm = useTranslations("recipes.form");
  const tErrors = useTranslations("recipes.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [foods, setFoods] = useState<ReadonlyMap<string, RecipeIngredientFood>>(
    () => new Map((initial?.foods ?? []).map((f) => [f.id, f]))
  );
  const [creatingFood, setCreatingFood] = useState<{ index: number; query: string; key: number } | null>(null);
  const [confirmUsed, setConfirmUsed] = useState<RecipeInput | null>(null);

  const form = useForm<RecipeFormValues, unknown, RecipeInput>({
    // The schema's input side is `unknown` per field (it preprocesses Arabic
    // digits etc.), which RHF can't use as form values; its output is exact.
    resolver: zodResolver(recipeSchema) as unknown as Resolver<RecipeFormValues, unknown, RecipeInput>,
    defaultValues: initial?.values ?? EMPTY_VALUES,
    mode: "onTouched",
  });
  const { register, control, handleSubmit, formState, setValue, setError, reset } = form;
  useUnsavedChanges(formState.isDirty && !pending, tForm("unsaved"));

  const rememberFood = useCallback((food: RecipeIngredientFood) => {
    setFoods((prev) => new Map(prev).set(food.id, food));
  }, []);

  const ingredients = useWatch({ control, name: "ingredients" });
  const servingsText = useWatch({ control, name: "servings" });
  const videoUrl = useWatch({ control, name: "video_url" });
  const servings = Math.min(20, Math.max(1, Math.trunc(Number(servingsText)) || 1));
  const nutrition = useMemo(
    () =>
      calculateRecipeNutrition(
        ingredients.map((row) => ({
          quantity: parseQuantity(row.quantity) ?? 0,
          unit: row.unit,
          food: row.food_id ? foods.get(row.food_id) : undefined,
        })),
        servings
      ),
    [ingredients, foods, servings]
  );

  function save(values: RecipeInput, asCopy: boolean) {
    setConfirmUsed(null);
    startTransition(async () => {
      try {
        const result = await saveRecipeAction(locale, asCopy ? null : (initial?.id ?? null), values);
        if ("error" in result) {
          if (result.index != null) {
            setError(`ingredients.${result.index}.food_id`, { message: result.error }, { shouldFocus: true });
          }
          toast.error(tErrors.has(result.error) ? tErrors(result.error) : tErrors("unknown"));
          return;
        }
        reset(form.getValues());
        toast.success(t("saved"));
        router.push("/library?tab=recipes");
      } catch {
        toast.error(tErrors("network"));
      }
    });
  }

  const onValid = (values: RecipeInput) => {
    if (initial && initial.planCount > 0) setConfirmUsed(values);
    else save(values, false);
  };

  const onInvalid = (errors: FieldErrors<RecipeFormValues>) => {
    // RHF focuses the first registered field with an error; errors that
    // have no input of their own (the list itself, a food picker) need a
    // scroll to their section instead.
    const ingredientsList = errors.ingredients?.root ?? (errors.ingredients && "message" in errors.ingredients);
    if (ingredientsList) document.getElementById("recipe-ingredients")?.scrollIntoView({ behavior: "smooth" });
  };

  const errorCount = formState.submitCount > 0 ? countErrors(formState.errors) : 0;
  const saveButton = (
    <Button type="submit" form="recipe-form" disabled={pending} className="min-w-28">
      {pending ? tForm("saving") : tForm("save")}
    </Button>
  );

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <form
          id="recipe-form"
          onSubmit={handleSubmit(onValid, onInvalid)}
          noValidate
          className="flex min-w-0 flex-col gap-5"
          aria-busy={pending}
        >
          {errorCount > 0 && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {tForm("errorSummary", { count: errorCount })}
            </p>
          )}

          <Section id="recipe-basics" title={tForm("sections.basics")}>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["name_ar", "name_en"] as const).map((name) => (
                <div key={name} className="flex flex-col gap-2">
                  <Label htmlFor={`recipe-${name}`}>{tForm(name === "name_ar" ? "nameAr" : "nameEn")}</Label>
                  <Input
                    id={`recipe-${name}`}
                    dir={name === "name_ar" ? "rtl" : "ltr"}
                    maxLength={80}
                    aria-invalid={!!formState.errors[name] || undefined}
                    aria-describedby={formState.errors[name] ? `recipe-${name}-error` : undefined}
                    {...register(name)}
                  />
                  <FieldError id={`recipe-${name}-error`} message={formState.errors[name]?.message} />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="recipe-description">{tForm("description")}</Label>
              <Textarea
                id="recipe-description"
                rows={2}
                maxLength={300}
                placeholder={tForm("descriptionPlaceholder")}
                aria-invalid={!!formState.errors.description || undefined}
                aria-describedby={formState.errors.description ? "recipe-description-error" : undefined}
                {...register("description")}
              />
              <FieldError id="recipe-description-error" message={formState.errors.description?.message} />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="col-span-2 flex flex-col gap-2 sm:col-span-1">
                <Label htmlFor="recipe-servings">{tForm("servings")}</Label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={tForm("servingsDecrease")}
                    disabled={servings <= 1}
                    onClick={() => setValue("servings", String(servings - 1), { shouldDirty: true, shouldValidate: true })}
                  >
                    <Minus className="size-4" />
                  </Button>
                  <Input
                    id="recipe-servings"
                    inputMode="numeric"
                    className="w-16 text-center font-mono tabular-nums"
                    aria-invalid={!!formState.errors.servings || undefined}
                    aria-describedby={formState.errors.servings ? "recipe-servings-error" : undefined}
                    {...register("servings")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={tForm("servingsIncrease")}
                    disabled={servings >= 20}
                    onClick={() => setValue("servings", String(servings + 1), { shouldDirty: true, shouldValidate: true })}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
                <FieldError id="recipe-servings-error" message={formState.errors.servings?.message} />
              </div>
              {(["prep_minutes", "cook_minutes"] as const).map((name) => (
                <div key={name} className="flex flex-col gap-2">
                  <Label htmlFor={`recipe-${name}`}>{tForm(name === "prep_minutes" ? "prepMinutes" : "cookMinutes")}</Label>
                  <Input
                    id={`recipe-${name}`}
                    inputMode="numeric"
                    className="font-mono tabular-nums"
                    aria-invalid={!!formState.errors[name] || undefined}
                    aria-describedby={formState.errors[name] ? `recipe-${name}-error` : undefined}
                    {...register(name)}
                  />
                  <FieldError id={`recipe-${name}-error`} message={formState.errors[name]?.message} />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="recipe-tags">{tForm("tags")}</Label>
              <Controller
                control={control}
                name="tags"
                render={({ field, fieldState }) => (
                  <TagsInput
                    id="recipe-tags"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!fieldState.error}
                    describedBy={fieldState.error ? "recipe-tags-error" : undefined}
                  />
                )}
              />
              <FieldError
                id="recipe-tags-error"
                message={formState.errors.tags?.message ?? formState.errors.tags?.find?.((e) => e?.message)?.message}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="recipe-image">{tForm("image")}</Label>
              <Controller
                control={control}
                name="image_path"
                render={({ field }) => (
                  <ImageField
                    coachId={coachId}
                    value={field.value}
                    savedPath={initial?.values.image_path || null}
                    initialUrl={initial?.imageUrl ?? null}
                    onChange={(path) => field.onChange(path)}
                  />
                )}
              />
            </div>
          </Section>

          <Section id="recipe-ingredients" title={tForm("sections.ingredients")}>
            <IngredientsField
              form={form}
              locale={locale}
              foods={foods}
              onFoodPicked={rememberFood}
              onCreateFood={(index, query) => setCreatingFood({ index, query, key: Date.now() })}
            />
          </Section>

          <Section id="recipe-steps" title={tForm("sections.steps")}>
            <StepsField form={form} />
          </Section>

          <Section id="recipe-video" title={tForm("sections.video")}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="recipe-video-url">{tForm("videoUrl")}</Label>
              <Input
                id="recipe-video-url"
                type="url"
                inputMode="url"
                dir="ltr"
                placeholder="https://youtu.be/…"
                aria-invalid={!!formState.errors.video_url || undefined}
                aria-describedby={formState.errors.video_url ? "recipe-video-error" : "recipe-video-hint"}
                {...register("video_url")}
              />
              <p id="recipe-video-hint" className="text-xs text-muted-foreground">
                {tForm("videoHint")}
              </p>
              <FieldError id="recipe-video-error" message={formState.errors.video_url?.message} />
              {videoUrl && !formState.errors.video_url && <VideoPreview url={videoUrl} />}
            </div>
          </Section>

          <div className="hidden items-center justify-end gap-2 lg:flex">
            <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/library?tab=recipes" />}>
              {tForm("cancel")}
            </Button>
            {saveButton}
          </div>
        </form>

        <aside className="hidden lg:sticky lg:top-4 lg:block">
          <NutritionPanel nutrition={nutrition} servings={servings} />
        </aside>
      </div>

      <NutritionBar nutrition={nutrition} servings={servings} action={saveButton} />

      {/* Outside the <form>: React events bubble through portals, so a
          dialog nested in the form tree would submit the recipe too. */}
      {creatingFood && (
        <FoodDialog
          key={creatingFood.key}
          locale={locale}
          mode="create"
          hideTrigger
          open
          defaults={
            ARABIC.test(creatingFood.query) ? { name_ar: creatingFood.query } : { name_en: creatingFood.query }
          }
          onOpenChange={(open) => {
            if (!open) setCreatingFood(null);
          }}
          onSaved={(created) => {
            const index = creatingFood.index;
            setCreatingFood(null);
            if (!created) return;
            const food = created as unknown as RecipeIngredientFood;
            rememberFood(food);
            setValue(`ingredients.${index}.food_id`, food.id, { shouldDirty: true, shouldValidate: true });
            // Same default as picking from the list: grams/ml when the serving allows it.
            const units = allowedUnits(food.serving_label);
            setValue(`ingredients.${index}.unit`, units[units.length - 1], { shouldDirty: true });
            // After the dialog has closed and returned focus.
            setTimeout(() => form.setFocus(`ingredients.${index}.quantity`), 0);
          }}
        />
      )}

      <Dialog open={confirmUsed !== null} onOpenChange={(open) => !open && setConfirmUsed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tForm("usedConfirm.title")}</DialogTitle>
            <DialogDescription>{tForm("usedConfirm.body", { count: initial?.planCount ?? 0 })}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setConfirmUsed(null)}>
              {tForm("cancel")}
            </Button>
            <Button type="button" variant="outline" onClick={() => confirmUsed && save(confirmUsed, true)}>
              {tForm("usedConfirm.copy")}
            </Button>
            <Button type="button" onClick={() => confirmUsed && save(confirmUsed, false)}>
              {tForm("usedConfirm.apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
