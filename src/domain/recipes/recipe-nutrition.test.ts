import { describe, expect, it } from "vitest";
import {
  allowedUnits,
  calculateRecipeNutrition,
  formatIngredientAmount,
  gramsPerServing,
  itemMacroFood,
  recipeAsMacroFood,
  servingFactor,
} from "./recipe-nutrition";
import { mealMacros } from "@/domain/nutrition/macros";

const chicken = { serving_label: "100g", kcal: 165, protein_g: 31, carb_g: 0, fat_g: 3.6 };
const milk = { serving_label: "250 ml", kcal: 150, protein_g: 8, carb_g: 12, fat_g: 8 };
const egg = { serving_label: "1 egg", kcal: 78, protein_g: 6.3, carb_g: 0.6, fat_g: 5.3 };

describe("gramsPerServing / allowedUnits", () => {
  it("reads plain gram and ml labels, case and spacing tolerant", () => {
    expect(gramsPerServing("100g")).toEqual({ amount: 100, unit: "g" });
    expect(gramsPerServing(" 250 ML ")).toEqual({ amount: 250, unit: "ml" });
    expect(gramsPerServing("1 cup")).toBeNull();
    expect(gramsPerServing("0g")).toBeNull();
    expect(gramsPerServing(null)).toBeNull();
  });

  it("offers g/ml only when the label is a gram/ml amount", () => {
    expect(allowedUnits("100g")).toEqual(["serving", "g"]);
    expect(allowedUnits("250ml")).toEqual(["serving", "ml"]);
    expect(allowedUnits("1 egg")).toEqual(["serving"]);
  });
});

describe("servingFactor", () => {
  it("is the quantity itself for servings", () => {
    expect(servingFactor(2.5, "serving", "1 egg")).toBe(2.5);
  });

  it("divides by the label amount for g/ml", () => {
    expect(servingFactor(150, "g", "100g")).toBe(1.5);
    expect(servingFactor(125, "ml", "250ml")).toBe(0.5);
  });

  it("is null when the unit doesn't fit the label", () => {
    expect(servingFactor(150, "g", "1 cup")).toBeNull();
    expect(servingFactor(150, "ml", "100g")).toBeNull();
  });
});

describe("calculateRecipeNutrition", () => {
  it("sums ingredients and splits per serving", () => {
    const { total, perServing } = calculateRecipeNutrition(
      [
        { quantity: 200, unit: "g", food: chicken },
        { quantity: 2, unit: "serving", food: egg },
      ],
      2
    );
    expect(total.kcal).toBeCloseTo(330 + 156);
    expect(total.protein_g).toBeCloseTo(62 + 12.6);
    expect(perServing.kcal).toBeCloseTo(243);
    expect(perServing.fat_g).toBeCloseTo((7.2 + 10.6) / 2);
  });

  it("doesn't round", () => {
    const { perServing } = calculateRecipeNutrition([{ quantity: 1, unit: "serving", food: egg }], 3);
    expect(perServing.kcal).toBe(26);
    expect(perServing.protein_g).toBeCloseTo(2.1, 10);
    expect(perServing.carb_g).toBeCloseTo(0.2, 10);
  });

  it("skips ingredients with no food or a unit that no longer fits", () => {
    const { total } = calculateRecipeNutrition(
      [
        { quantity: 100, unit: "ml", food: milk },
        { quantity: 100, unit: "g", food: { ...chicken, serving_label: "1 breast" } },
        { quantity: 1, unit: "serving", food: null },
      ],
      1
    );
    expect(total.kcal).toBeCloseTo(60);
    expect(total.protein_g).toBeCloseTo(3.2);
    expect(total.carb_g).toBeCloseTo(4.8);
    expect(total.fat_g).toBeCloseTo(3.2);
  });

  it("is all zeros with no ingredients, and never divides by zero", () => {
    expect(calculateRecipeNutrition([], 4).perServing).toEqual({ kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 });
    expect(calculateRecipeNutrition([{ quantity: 1, unit: "serving", food: egg }], 0).perServing.kcal).toBe(78);
  });
});

describe("recipeAsMacroFood / itemMacroFood", () => {
  const recipe = { servings: 2, recipe_ingredients: [{ quantity: 200, unit: "g", foods: chicken }] };

  it("plugs into mealMacros with quantity = recipe servings", () => {
    const totals = mealMacros([
      { quantity: 1.5, food: recipeAsMacroFood(recipe) },
      { quantity: 1, food: egg },
    ]);
    expect(totals.kcal).toBeCloseTo(165 * 1.5 + 78, 1);
  });

  it("picks the food, else the recipe, else nothing", () => {
    expect(itemMacroFood({ foods: egg, recipes: null })).toBe(egg);
    expect(itemMacroFood({ foods: null, recipes: recipe })?.kcal).toBeCloseTo(165);
    expect(itemMacroFood({ foods: null, recipes: null })).toBeNull();
  });
});

describe("formatIngredientAmount", () => {
  it("shows g/ml directly and servings through formatServing, scaled", () => {
    expect(formatIngredientAmount(150, "g", "100g")).toBe("150g");
    expect(formatIngredientAmount(150, "g", "100g", 1.5)).toBe("225g");
    expect(formatIngredientAmount(2, "serving", "1 egg")).toBe("2 × 1 egg");
    expect(formatIngredientAmount(1, "serving", "100g", 0.5)).toBe("50g");
    expect(formatIngredientAmount(100, "ml", "250ml", 1 / 3)).toBe("33.3ml");
  });
});
