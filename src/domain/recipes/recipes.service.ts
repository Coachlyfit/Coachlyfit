import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { normalizePaging, runPaged, type LibraryPage } from "@/domain/library/library.service";
import { allowedUnits } from "./recipe-nutrition";
import type { RecipeInput } from "./recipe.schema";

export const RECIPE_IMAGES_BUCKET = "recipe-images";

type RecipeRow = Database["public"]["Tables"]["recipes"]["Row"];

/** recipes_with_macros (20261025000001): the base row plus unrounded
 * per-serving macros, total time and how many live plans use it. View Row
 * types come back all-nullable, so this re-asserts the real shape. */
export type RecipeListRow = RecipeRow & {
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  total_minutes: number;
  plan_count: number;
};

export const RECIPE_FOOD_FIELDS = "id, name_ar, name_en, category, serving_label, kcal, protein_g, carb_g, fat_g";

export type RecipeIngredientFood = {
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

export type RecipeDetail = RecipeRow & {
  recipe_ingredients: {
    id: string;
    food_id: string;
    quantity: number;
    unit: string;
    position: number;
    note: string | null;
    foods: RecipeIngredientFood | null;
  }[];
};

export const RECIPE_SORTS = ["newest", "name", "kcal"] as const;
export type RecipeSort = (typeof RECIPE_SORTS)[number];

export type RecipeQuery = {
  query?: string;
  tag?: string | null;
  sort?: RecipeSort;
  /** Which name column "name" sorts by. */
  locale?: "ar" | "en";
  page?: number;
  pageSize?: number;
};

export type SaveRecipeResult = { id: string } | { error: string; index?: number };

/** Postgres errors from recipe writes → `recipes.errors.*` keys. */
export function recipeErrorKey(error: unknown): string {
  const { code, hint } = (error ?? {}) as { code?: string; hint?: string };
  if (hint === "not_found_or_forbidden" || hint === "ingredients_count") return hint;
  if (code === "23503") return "in_use";
  if (code === "23514" || code === "23502" || code === "22P02") return "invalid_input";
  if (code === "42501") return "forbidden";
  return "unknown";
}

// Same idea as library.service's sanitizeSearchTerm: `,()` are PostgREST
// or()-filter syntax.
function sanitizeSearchTerm(query: string) {
  return query.replace(/[,()%]/g, " ").trim();
}

export class RecipesService {
  constructor(private db: SupabaseClient<Database>) {}

  /** The library grid: live (non-archived) recipes only. */
  async list(params: RecipeQuery = {}): Promise<LibraryPage<RecipeListRow>> {
    const { page, pageSize } = normalizePaging(params);
    const sort = params.sort ?? "newest";
    const build = (p: number) => {
      let q = this.db.from("recipes_with_macros").select("*", { count: "exact" }).is("archived_at", null);
      const term = sanitizeSearchTerm(params.query ?? "");
      if (term) q = q.or(`name_ar.ilike.%${term}%,name_en.ilike.%${term}%`);
      if (params.tag) q = q.contains("tags", [params.tag]);
      if (sort === "name") q = q.order(params.locale === "ar" ? "name_ar" : "name_en");
      else if (sort === "kcal") q = q.order("kcal");
      else q = q.order("created_at", { ascending: false });
      return q.order("id").range((p - 1) * pageSize, p * pageSize - 1).returns<RecipeListRow[]>();
    };
    return runPaged(build, page, pageSize);
  }

  /** One recipe with every ingredient and its food in a single query. RLS
   * decides who may read it (owner coach, or a client it was assigned to). */
  async get(id: string): Promise<RecipeDetail | null> {
    const { data, error } = await this.db
      .from("recipes")
      .select(`*, recipe_ingredients(id, food_id, quantity, unit, position, note, foods(${RECIPE_FOOD_FIELDS}))`)
      .eq("id", id)
      .order("position", { referencedTable: "recipe_ingredients" })
      .maybeSingle()
      .returns<RecipeDetail | null>();
    if (error) throw error;
    return data;
  }

  /** Non-archived plans currently using the recipe, for the edit warning. */
  async planCount(id: string): Promise<number> {
    const { data, error } = await this.db.from("recipes_with_macros").select("plan_count").eq("id", id).maybeSingle();
    if (error) throw error;
    return data?.plan_count ?? 0;
  }

  /** Every tag the coach has used, for the filter chips. */
  async tags(): Promise<string[]> {
    const { data, error } = await this.db.from("recipes").select("tags").is("archived_at", null);
    if (error) throw error;
    return [...new Set((data ?? []).flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));
  }

  /** Creates (id null) or replaces a recipe and its ingredient list. Checks
   * what the DB can't express per row first, so the form can point at the
   * exact ingredient: the food must be visible to this coach (RLS on foods
   * hides anything else) and the unit must fit its serving_label. */
  async save(id: string | null, input: RecipeInput): Promise<SaveRecipeResult> {
    const foodIds = [...new Set(input.ingredients.map((i) => i.food_id))];
    const { data: foods, error: foodsError } = await this.db
      .from("foods")
      .select("id, serving_label")
      .in("id", foodIds);
    if (foodsError) throw foodsError;
    const labels = new Map((foods ?? []).map((f) => [f.id, f.serving_label]));

    for (const [index, ingredient] of input.ingredients.entries()) {
      if (!labels.has(ingredient.food_id)) return { error: "ingredient_food_unavailable", index };
      const units: readonly string[] = allowedUnits(labels.get(ingredient.food_id));
      if (!units.includes(ingredient.unit)) return { error: "ingredient_unit_invalid", index };
    }

    const previousImage = id ? await this.imagePath(id) : null;

    const { data, error } = await this.db.rpc("save_recipe", {
      ...(id ? { p_id: id } : {}),
      p_recipe: {
        name_ar: input.name_ar,
        name_en: input.name_en,
        description: input.description,
        servings: input.servings,
        prep_minutes: input.prep_minutes,
        cook_minutes: input.cook_minutes,
        steps: input.steps.map((s) => s.text),
        tags: input.tags,
        video_url: input.video_url,
        image_path: input.image_path,
      },
      p_ingredients: input.ingredients.map(({ food_id, quantity, unit, note }) => ({ food_id, quantity, unit, note })),
    });
    if (error) return { error: recipeErrorKey(error) };

    if (previousImage && previousImage !== input.image_path) await this.removeImage(previousImage);
    return { id: data };
  }

  /** Hard delete when no meal item references the recipe; otherwise the FK
   * refuses (23503) and the recipe is archived instead, which hides it from
   * the library and pickers while existing plans keep rendering it. */
  async remove(id: string): Promise<"deleted" | "archived" | "not_found"> {
    const image = await this.imagePath(id);
    const { data, error } = await this.db.from("recipes").delete().eq("id", id).select("id");
    if (error?.code === "23503") {
      const archived = await this.db
        .from("recipes")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (archived.error) throw archived.error;
      return archived.data.length > 0 ? "archived" : "not_found";
    }
    if (error) throw error;
    if (data.length === 0) return "not_found";
    if (image) await this.removeImage(image);
    return "deleted";
  }

  /** A full copy under a new name, including its own copy of the image so
   * deleting either recipe never breaks the other's picture. */
  async duplicate(id: string, name: { ar: string; en: string }): Promise<SaveRecipeResult> {
    const recipe = await this.get(id);
    if (!recipe) return { error: "not_found_or_forbidden" };

    let imagePath: string | null = null;
    if (recipe.image_path) {
      const copyPath = `${recipe.image_path.split("/")[0]}/${crypto.randomUUID()}.webp`;
      const { error } = await this.db.storage.from(RECIPE_IMAGES_BUCKET).copy(recipe.image_path, copyPath);
      // ponytail: a failed image copy still duplicates the recipe, just without a picture.
      if (!error) imagePath = copyPath;
    }

    const { data, error } = await this.db.rpc("save_recipe", {
      p_recipe: {
        name_ar: name.ar.slice(0, 80),
        name_en: name.en.slice(0, 80),
        description: recipe.description,
        servings: recipe.servings,
        prep_minutes: recipe.prep_minutes,
        cook_minutes: recipe.cook_minutes,
        steps: recipe.steps,
        tags: recipe.tags,
        video_url: recipe.video_url,
        image_path: imagePath,
      },
      p_ingredients: recipe.recipe_ingredients.map((i) => ({
        food_id: i.food_id,
        quantity: i.quantity,
        unit: i.unit,
        note: i.note,
      })),
    });
    if (error) {
      if (imagePath) await this.removeImage(imagePath);
      return { error: recipeErrorKey(error) };
    }
    return { id: data };
  }

  /** Signed display URLs for private recipe images, keyed by path. A path
   * that fails to sign is dropped, so one missing file can't blank a grid. */
  async signImages(paths: string[], expiresInSeconds = 3600): Promise<Map<string, string>> {
    const unique = [...new Set(paths)];
    if (unique.length === 0) return new Map();
    const { data, error } = await this.db.storage
      .from(RECIPE_IMAGES_BUCKET)
      .createSignedUrls(unique, expiresInSeconds);
    if (error) throw error;
    const signed = new Map<string, string>();
    for (const entry of data) {
      if (!entry.error && entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
    }
    return signed;
  }

  async removeImage(path: string): Promise<void> {
    // ponytail: best effort. A leftover file costs storage, not correctness,
    // and failing the save over it would lose the coach's edit.
    await this.db.storage.from(RECIPE_IMAGES_BUCKET).remove([path]);
  }

  private async imagePath(id: string): Promise<string | null> {
    const { data, error } = await this.db.from("recipes").select("image_path").eq("id", id).maybeSingle();
    if (error) throw error;
    return data?.image_path ?? null;
  }
}
