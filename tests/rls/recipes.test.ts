// Recipes (20261025000001_recipes.sql): a coach reads and writes only their
// own recipes and ingredients, and only with foods they can see. A client
// reads a recipe, its ingredients, their foods and its image only once it
// sits in one of their meal items. The view's macros match the TS
// calculation.
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { calculateRecipeNutrition } from "@/domain/recipes/recipe-nutrition";
import { createRlsUser } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

let coachA: User;
let coachB: User;
let client: User;
let clientId: string;
let otherClient: User;
let otherClientId: string;
let foodA: string;
let foodB: string;
let recipeId: string;
let imagePath: string;

async function createCoach(tag: string) {
  return createRlsUser(`recipes-coach-${tag}`, {
    role: "coach",
    full_name: `Coach ${tag}`,
    business_name: `${tag} Gym`,
    locale: "en",
  });
}

// Same shape as nutrition.test.ts's inviteClient.
async function inviteClient(coach: User, tag: string) {
  const { data: row, error } = await coach.client
    .from("clients")
    .insert({ coach_id: coach.userId, display_name: `Client ${tag}` })
    .select("id")
    .single();
  if (error) throw error;
  const tokenHash = createHash("sha256").update(randomBytes(24).toString("base64url")).digest("hex");
  const invite = await coach.client.from("invites").insert({ coach_id: coach.userId, client_id: row.id, token_hash: tokenHash });
  if (invite.error) throw invite.error;
  const user = await createRlsUser(`recipes-client-${tag}`, {
    role: "client",
    full_name: `Client ${tag}`,
    locale: "en",
    invite_token_hash: tokenHash,
  });
  return { id: row.id, user };
}

async function createFood(coach: User, servingLabel: string, kcal: number) {
  const { data, error } = await coach.client
    .from("foods")
    .insert({
      coach_id: coach.userId,
      name_ar: "طعام",
      name_en: "Food",
      serving_label: servingLabel,
      kcal,
      protein_g: 10,
      carb_g: 20,
      fat_g: 5,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

function saveRecipe(coach: User, id: string | null, foodId: string, image: string | null = null) {
  return coach.client.rpc("save_recipe", {
    ...(id ? { p_id: id } : {}),
    p_recipe: { name_ar: "وصفة", name_en: "Recipe", servings: 2, steps: ["Mix it all"], tags: ["test"], image_path: image },
    p_ingredients: [
      { food_id: foodId, quantity: 150, unit: "g", note: "chopped" },
      { food_id: foodId, quantity: 1, unit: "serving", note: null },
    ],
  });
}

async function assignRecipe(coach: User, toClientId: string, recipe: string) {
  const { data: plan, error: planError } = await coach.client
    .from("diet_plans")
    .insert({ coach_id: coach.userId, client_id: toClientId, name_ar: "خطة", name_en: "Plan" })
    .select("id")
    .single();
  if (planError) throw planError;
  const { data: meal, error: mealError } = await coach.client
    .from("meals")
    .insert({ coach_id: coach.userId, client_id: toClientId, diet_plan_id: plan.id })
    .select("id")
    .single();
  if (mealError) throw mealError;
  return coach.client
    .from("meal_items")
    .insert({ coach_id: coach.userId, client_id: toClientId, meal_id: meal.id, recipe_id: recipe, quantity: 1.5 });
}

async function recipeIdsSeenBy(user: User) {
  const { data, error } = await user.client.from("recipes").select("id").eq("id", recipeId);
  if (error) throw error;
  return data.map((r) => r.id);
}

beforeAll(async () => {
  [coachA, coachB] = await Promise.all([createCoach("a"), createCoach("b")]);
  const [mine, other] = await Promise.all([inviteClient(coachA, "mine"), inviteClient(coachA, "other")]);
  ({ id: clientId, user: client } = mine);
  ({ id: otherClientId, user: otherClient } = other);
  [foodA, foodB] = await Promise.all([createFood(coachA, "100g", 200), createFood(coachB, "100g", 300)]);

  imagePath = `${coachA.userId}/${crypto.randomUUID()}.webp`;
  const upload = await coachA.client.storage
    .from("recipe-images")
    .upload(imagePath, new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }));
  if (upload.error) throw upload.error;

  const { data, error } = await saveRecipe(coachA, null, foodA, imagePath);
  if (error) throw error;
  recipeId = data;
}, 60_000);

describe("coach isolation", () => {
  it("the owner sees the recipe and its ingredients; another coach sees neither", async () => {
    expect(await recipeIdsSeenBy(coachA)).toEqual([recipeId]);
    expect(await recipeIdsSeenBy(coachB)).toEqual([]);
    const ingredients = await coachB.client.from("recipe_ingredients").select("id").eq("recipe_id", recipeId);
    expect(ingredients.data).toEqual([]);
  });

  it("another coach can't edit, replace or delete it", async () => {
    const update = await coachB.client.from("recipes").update({ name_en: "Hijacked" }).eq("id", recipeId).select("id");
    expect(update.data).toEqual([]);
    const rpc = await saveRecipe(coachB, recipeId, foodB);
    expect(rpc.error?.hint).toBe("not_found_or_forbidden");
    const del = await coachB.client.from("recipes").delete().eq("id", recipeId).select("id");
    expect(del.data).toEqual([]);
    const insert = await coachB.client
      .from("recipe_ingredients")
      .insert({ recipe_id: recipeId, food_id: foodB, quantity: 1, unit: "serving", position: 9 });
    expect(insert.error).not.toBeNull();
  });

  it("a recipe can't use another coach's private food", async () => {
    const { error } = await saveRecipe(coachA, null, foodB);
    expect(error).not.toBeNull();
  });

  it("an image path outside the coach's own folder is refused", async () => {
    const { error } = await saveRecipe(coachA, null, foodA, `${coachB.userId}/stolen.webp`);
    expect(error?.code).toBe("23514");
  });

  it("another coach can't sign the image", async () => {
    const { error } = await coachB.client.storage.from("recipe-images").createSignedUrl(imagePath, 60);
    expect(error).not.toBeNull();
  });
});

describe("client access", () => {
  it("nothing is visible before the recipe is in the client's plan", async () => {
    expect(await recipeIdsSeenBy(client)).toEqual([]);
    const { error } = await client.client.storage.from("recipe-images").createSignedUrl(imagePath, 60);
    expect(error).not.toBeNull();
  });

  it("a coach can't put another coach's recipe in a meal", async () => {
    const { error } = await assignRecipe(coachB, otherClientId, recipeId);
    expect(error).not.toBeNull();
  });

  it("once assigned, the client reads the recipe, ingredients, foods and image, but can't edit", async () => {
    const assigned = await assignRecipe(coachA, clientId, recipeId);
    expect(assigned.error).toBeNull();

    const { data, error } = await client.client
      .from("recipes")
      .select("id, recipe_ingredients(quantity, foods(id, kcal))")
      .eq("id", recipeId)
      .single();
    expect(error).toBeNull();
    expect(data?.recipe_ingredients).toHaveLength(2);
    expect(data?.recipe_ingredients.every((i) => i.foods?.id === foodA)).toBe(true);

    const signed = await client.client.storage.from("recipe-images").createSignedUrl(imagePath, 60);
    expect(signed.error).toBeNull();

    const update = await client.client.from("recipes").update({ name_en: "Mine now" }).eq("id", recipeId).select("id");
    expect(update.data).toEqual([]);
  });

  it("another client of the same coach still sees nothing", async () => {
    expect(await recipeIdsSeenBy(otherClient)).toEqual([]);
    const { error } = await otherClient.client.storage.from("recipe-images").createSignedUrl(imagePath, 60);
    expect(error).not.toBeNull();
  });

  it("a recipe in a plan can't be hard-deleted", async () => {
    const { error } = await coachA.client.from("recipes").delete().eq("id", recipeId);
    expect(error?.code).toBe("23503");
  });
});

describe("recipes_with_macros", () => {
  it("matches calculateRecipeNutrition and counts the plan", async () => {
    const { data, error } = await coachA.client
      .from("recipes_with_macros")
      .select("kcal, protein_g, carb_g, fat_g, plan_count")
      .eq("id", recipeId)
      .single();
    expect(error).toBeNull();
    const food = { serving_label: "100g", kcal: 200, protein_g: 10, carb_g: 20, fat_g: 5 };
    const { perServing } = calculateRecipeNutrition(
      [
        { quantity: 150, unit: "g", food },
        { quantity: 1, unit: "serving", food },
      ],
      2
    );
    expect(Number(data?.kcal)).toBeCloseTo(perServing.kcal, 6);
    expect(Number(data?.protein_g)).toBeCloseTo(perServing.protein_g, 6);
    expect(Number(data?.carb_g)).toBeCloseTo(perServing.carb_g, 6);
    expect(Number(data?.fat_g)).toBeCloseTo(perServing.fat_g, 6);
    expect(data?.plan_count).toBe(1);
  });
});
