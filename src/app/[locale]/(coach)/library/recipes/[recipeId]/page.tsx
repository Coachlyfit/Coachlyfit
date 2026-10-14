import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getRequestCoachId } from "@/lib/auth/session";
import { Link } from "@/i18n/navigation";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { RecipesService } from "@/domain/recipes/recipes.service";
import type { IngredientUnit } from "@/domain/recipes/recipe-nutrition";
import { PageTitle } from "@/components/dashboard/page-title";
import { RecipeForm, type RecipeFormInitial } from "../recipe-form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ locale: AppLocale; recipeId: string }>;
}) {
  const { locale, recipeId } = await params;
  if (!UUID.test(recipeId)) notFound();

  const supabase = await createClient();
  const service = new RecipesService(supabase);
  const [t, coachId, recipe, planCount] = await Promise.all([
    getTranslations("recipes"),
    getRequestCoachId(),
    service.get(recipeId),
    service.planCount(recipeId),
  ]);
  // RLS returns another coach's recipe as null, same as a missing one.
  if (!coachId || !recipe || recipe.coach_id !== coachId) notFound();

  const imageUrl = recipe.image_path ? ((await service.signImages([recipe.image_path])).get(recipe.image_path) ?? null) : null;

  const initial: RecipeFormInitial = {
    id: recipe.id,
    imageUrl,
    planCount,
    foods: recipe.recipe_ingredients.flatMap((i) => (i.foods ? [i.foods] : [])),
    values: {
      name_ar: recipe.name_ar,
      name_en: recipe.name_en,
      description: recipe.description ?? "",
      servings: String(recipe.servings),
      prep_minutes: recipe.prep_minutes == null ? "" : String(recipe.prep_minutes),
      cook_minutes: recipe.cook_minutes == null ? "" : String(recipe.cook_minutes),
      ingredients: recipe.recipe_ingredients.map((i) => ({
        food_id: i.food_id,
        quantity: String(Number(i.quantity)),
        unit: i.unit as IngredientUnit,
        note: i.note ?? "",
      })),
      steps: recipe.steps.length > 0 ? recipe.steps.map((text) => ({ text })) : [{ text: "" }],
      tags: recipe.tags,
      video_url: recipe.video_url ?? "",
      image_path: recipe.image_path ?? "",
    },
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={t("editTitle")} subtitle={pickLocale(recipe, locale)} />
      <Link
        href="/library?tab=recipes"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {t("backToLibrary")}
      </Link>
      <RecipeForm locale={locale} coachId={coachId} initial={initial} />
    </div>
  );
}
