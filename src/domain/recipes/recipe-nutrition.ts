import { GRAM_SERVING_RE, type MacroFood, type MacroTotals } from "@/domain/nutrition/macros";

export const INGREDIENT_UNITS = ["serving", "g", "ml"] as const;
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

export type IngredientFood = MacroFood & { serving_label: string | null };
export type NutritionIngredient = { quantity: number; unit: string; food: IngredientFood | null | undefined };

const ZERO: MacroTotals = { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 };

/** "100g" → { amount: 100, unit: "g" }; anything else (a "1 cup" label) → null. */
export function gramsPerServing(servingLabel: string | null | undefined): { amount: number; unit: "g" | "ml" } | null {
  const m = (servingLabel ?? "").trim().match(GRAM_SERVING_RE);
  if (!m) return null;
  const amount = Number(m[1]);
  return amount > 0 ? { amount, unit: m[2].toLowerCase() as "g" | "ml" } : null;
}

/** Units an ingredient of this food can be entered in: always "serving",
 * plus g or ml when the label is a plain gram/ml amount. */
export function allowedUnits(servingLabel: string | null | undefined): IngredientUnit[] {
  const grams = gramsPerServing(servingLabel);
  return grams ? ["serving", grams.unit] : ["serving"];
}

/** How many of the food's stored serving the ingredient amounts to, or null
 * when the unit doesn't fit the label (e.g. a gram amount of a food whose
 * label was later changed to "1 cup"). SQL twin: private.serving_factor in
 * 20261025000001_recipes.sql. */
export function servingFactor(quantity: number, unit: string, servingLabel: string | null | undefined): number | null {
  if (unit === "serving") return quantity;
  const grams = gramsPerServing(servingLabel);
  return grams && grams.unit === unit ? quantity / grams.amount : null;
}

/** Whole-recipe and per-serving macros. Unrounded on purpose: rounding is a
 * display concern, and summing rounded parts drifts. Ingredients whose unit
 * no longer fits their food (servingFactor null) or whose food is missing
 * contribute nothing, same as the SQL view. */
export function calculateRecipeNutrition(
  ingredients: NutritionIngredient[],
  servings: number
): { total: MacroTotals; perServing: MacroTotals } {
  const total = { ...ZERO };
  for (const { quantity, unit, food } of ingredients) {
    if (!food) continue;
    const factor = servingFactor(quantity, unit, food.serving_label);
    if (factor == null) continue;
    total.kcal += food.kcal * factor;
    total.protein_g += food.protein_g * factor;
    total.carb_g += food.carb_g * factor;
    total.fat_g += food.fat_g * factor;
  }
  const divisor = servings > 0 ? servings : 1;
  return {
    total,
    perServing: {
      kcal: total.kcal / divisor,
      protein_g: total.protein_g / divisor,
      carb_g: total.carb_g / divisor,
      fat_g: total.fat_g / divisor,
    },
  };
}

/** A recipe as one "food" whose serving is one recipe serving, so a meal
 * item pointing at a recipe goes through itemMacros/mealMacros unchanged
 * (quantity = number of recipe servings). */
export function recipeAsMacroFood(recipe: {
  servings: number;
  recipe_ingredients: NutritionIngredient[];
}): MacroFood {
  return calculateRecipeNutrition(recipe.recipe_ingredients, recipe.servings).perServing;
}
