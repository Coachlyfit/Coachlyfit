"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { recipeSchema } from "@/domain/recipes/recipe.schema";
import {
  RECIPE_SORTS,
  RecipesService,
  recipeErrorKey,
  type RecipeListRow,
  type RecipeQuery,
  type SaveRecipeResult,
} from "@/domain/recipes/recipes.service";
import type { LibraryPage } from "@/domain/library/library.service";

export type RecipeCardRow = RecipeListRow & { image_url: string | null };

// Actions don't inherit the (coach) layout guard, so each re-checks auth;
// RLS decides which rows. Raw errors are logged here and never returned.

function revalidate(locale: string) {
  revalidatePath(`/${locale}/library`);
  revalidatePath(`/${locale}/diets`, "layout");
}

/** The library grid and the meal-plan picker: live recipes, with signed
 * image URLs (the bucket is private). */
export async function searchRecipesAction(params: RecipeQuery = {}): Promise<LibraryPage<RecipeCardRow>> {
  const supabase = await createClient();
  const service = new RecipesService(supabase);
  const sort = params.sort && (RECIPE_SORTS as readonly string[]).includes(params.sort) ? params.sort : "newest";
  const page = await service.list({ ...params, sort });
  const urls = await service.signImages(page.rows.flatMap((r) => (r.image_path ? [r.image_path] : [])));
  return { ...page, rows: page.rows.map((r) => ({ ...r, image_url: r.image_path ? (urls.get(r.image_path) ?? null) : null })) };
}

export async function recipeTagsAction(): Promise<string[]> {
  const supabase = await createClient();
  return new RecipesService(supabase).tags();
}

/** Create (id null) or update. `input` is the form's parsed output, parsed
 * again here: the client can't be trusted to have run the schema. */
export async function saveRecipeAction(locale: string, id: string | null, input: unknown): Promise<SaveRecipeResult> {
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };
  // The DB CHECK enforces this too; failing early gives a clearer message.
  if (parsed.data.image_path && !parsed.data.image_path.startsWith(`${coachId}/`)) return { error: "invalid_input" };

  try {
    const result = await new RecipesService(supabase).save(id, parsed.data);
    if ("id" in result) revalidate(locale);
    return result;
  } catch (error) {
    console.error("saveRecipeAction", error);
    return { error: recipeErrorKey(error) };
  }
}

export async function deleteRecipeAction(
  locale: string,
  id: string
): Promise<{ error: string } | { outcome: "deleted" | "archived" }> {
  const supabase = await createClient();
  if (!(await resolveCoachId(supabase))) return { error: "not_authenticated" };
  try {
    const outcome = await new RecipesService(supabase).remove(id);
    if (outcome === "not_found") return { error: "not_found_or_forbidden" };
    revalidate(locale);
    return { outcome };
  } catch (error) {
    console.error("deleteRecipeAction", error);
    return { error: recipeErrorKey(error) };
  }
}

export async function duplicateRecipeAction(locale: string, id: string): Promise<SaveRecipeResult> {
  const supabase = await createClient();
  if (!(await resolveCoachId(supabase))) return { error: "not_authenticated" };
  const service = new RecipesService(supabase);
  try {
    const source = await service.get(id);
    if (!source) return { error: "not_found_or_forbidden" };
    const [tAr, tEn] = await Promise.all([
      getTranslations({ locale: "ar", namespace: "recipes" }),
      getTranslations({ locale: "en", namespace: "recipes" }),
    ]);
    const result = await service.duplicate(id, {
      ar: tAr("copyName", { name: source.name_ar }),
      en: tEn("copyName", { name: source.name_en }),
    });
    if ("id" in result) revalidate(locale);
    return result;
  } catch (error) {
    console.error("duplicateRecipeAction", error);
    return { error: recipeErrorKey(error) };
  }
}
