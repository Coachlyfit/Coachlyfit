import { describe, expect, it } from "vitest";
import { itemMacros, mealMacros, planMacros, macroPercentages, targetDelta, formatServing, planWarnings, type MacroFood, type MacroTotals } from "./macros";

const chickenBreast: MacroFood = { kcal: 165, protein_g: 31, carb_g: 0, fat_g: 3.6 };
const rice: MacroFood = { kcal: 130, protein_g: 2.7, carb_g: 28, fat_g: 0.3 };

describe("itemMacros", () => {
  it("scales a food's per-serving macros by quantity", () => {
    expect(itemMacros(1.5, chickenBreast)).toEqual({ kcal: 247.5, protein_g: 46.5, carb_g: 0, fat_g: 5.4 });
  });

  it("returns zeroed macros for quantity 0", () => {
    expect(itemMacros(0, chickenBreast)).toEqual({ kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 });
  });
});

describe("mealMacros", () => {
  it("sums macros across every item in a meal", () => {
    const items = [
      { quantity: 1.5, food: chickenBreast },
      { quantity: 2, food: rice },
    ];
    // chicken: 247.5/46.5/0/5.4, rice x2: 260/5.4/56/0.6
    expect(mealMacros(items)).toEqual({ kcal: 507.5, protein_g: 51.9, carb_g: 56, fat_g: 6 });
  });

  it("returns zeroed macros for an empty meal", () => {
    expect(mealMacros([])).toEqual({ kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 });
  });
});

describe("planMacros", () => {
  it("sums macros across every meal in a plan", () => {
    const meals = [
      [{ quantity: 1, food: chickenBreast }],
      [{ quantity: 1, food: rice }],
    ];
    expect(planMacros(meals)).toEqual({ kcal: 295, protein_g: 33.7, carb_g: 28, fat_g: 3.9 });
  });
});

describe("macroPercentages", () => {
  it("splits kcal by protein(4)/carb(4)/fat(9) kcal-per-gram, rounded to whole percent", () => {
    // pure protein+carb+fat, no rounding drama: 25g protein=100kcal, 25g carb=100kcal, 20g fat=180kcal, total 380
    const totals: MacroTotals = { kcal: 380, protein_g: 25, carb_g: 25, fat_g: 20 };
    const result = macroPercentages(totals);
    expect(result.proteinPercent + result.carbPercent + result.fatPercent).toBeLessThanOrEqual(100);
    expect(result.proteinPercent).toBeCloseTo(26, 0);
    expect(result.carbPercent).toBeCloseTo(26, 0);
    expect(result.fatPercent).toBeCloseTo(47, 0);
  });

  it("returns all zero percentages for zero kcal, rather than dividing by zero", () => {
    expect(macroPercentages({ kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 })).toEqual({
      proteinPercent: 0,
      carbPercent: 0,
      fatPercent: 0,
    });
  });
});

describe("targetDelta", () => {
  it("returns planned minus target for each macro with a target set", () => {
    const totals = { kcal: 2500, protein_g: 150, carb_g: 300, fat_g: 70 };
    const targets = { target_kcal: 2800, target_protein_g: 180, target_carb_g: null, target_fat_g: 75 };
    expect(targetDelta(totals, targets)).toEqual({ kcal: -300, protein_g: -30, carb_g: null, fat_g: -5 });
  });

  it("returns null for every macro when no targets are set", () => {
    const totals = { kcal: 2500, protein_g: 150, carb_g: 300, fat_g: 70 };
    const targets = { target_kcal: null, target_protein_g: null, target_carb_g: null, target_fat_g: null };
    expect(targetDelta(totals, targets)).toEqual({ kcal: null, protein_g: null, carb_g: null, fat_g: null });
  });
});

describe("formatServing", () => {
  it("multiplies a plain gram/ml serving label", () => {
    expect(formatServing(1.5, "100g")).toBe("150g");
    expect(formatServing(2, "250 ml")).toBe("500ml");
  });

  it("prefixes a count for non-metric labels, bare label at quantity 1", () => {
    expect(formatServing(2, "1 cup")).toBe("2 × 1 cup");
    expect(formatServing(1, "1 slice")).toBe("1 slice");
  });
});

describe("planWarnings", () => {
  const noTargets = { target_kcal: null, target_protein_g: null, target_carb_g: null, target_fat_g: null };

  it("flags targets whose macros don't add up to the kcal target", () => {
    // 200*4 + 200*4 + 50*9 = 2050, vs 3000 target
    const w = planWarnings([], { target_kcal: 3000, target_protein_g: 200, target_carb_g: 200, target_fat_g: 50 });
    expect(w).toContainEqual({ code: "macro_kcal_mismatch", macroKcal: 2050, targetKcal: 3000 });
  });

  it("flags over/under target only once food exists", () => {
    const targets = { ...noTargets, target_kcal: 1000 };
    expect(planWarnings([[]], targets)).toEqual([{ code: "empty_meal", mealIndex: 0 }]);
    expect(planWarnings([[{ quantity: 10, food: chickenBreast }]], targets)).toContainEqual({
      code: "over_target",
      delta: 650,
    });
    expect(planWarnings([[{ quantity: 1, food: chickenBreast }]], targets)).toContainEqual({
      code: "under_target",
      delta: -835,
    });
  });

  it("is quiet within tolerance", () => {
    expect(planWarnings([[{ quantity: 6, food: chickenBreast }]], { ...noTargets, target_kcal: 1000 })).toEqual([]);
  });
});
