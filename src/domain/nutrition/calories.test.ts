import { describe, expect, it } from "vitest";
import { calculateBmr, calculateTdee, estimateBodyFatNavy, type BmrInput } from "./calories";

describe("calculateBmr", () => {
  it("computes Mifflin-St Jeor for a male", () => {
    const input: BmrInput = { formula: "mifflin_st_jeor", sex: "male", ageYears: 30, weightKg: 80, heightCm: 180 };
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5
    expect(calculateBmr(input)).toBe(1780);
  });

  it("computes Mifflin-St Jeor for a female", () => {
    const input: BmrInput = { formula: "mifflin_st_jeor", sex: "female", ageYears: 28, weightKg: 60, heightCm: 165 };
    // 10*60 + 6.25*165 - 5*28 - 161 = 600 + 1031.25 - 140 - 161
    expect(calculateBmr(input)).toBe(1330);
  });

  it("computes revised Harris-Benedict for a male", () => {
    const input: BmrInput = { formula: "harris_benedict", sex: "male", ageYears: 30, weightKg: 80, heightCm: 180 };
    // 13.397*80 + 4.799*180 - 5.677*30 + 88.362 = 1071.76 + 863.82 - 170.31 + 88.362
    expect(calculateBmr(input)).toBe(1854);
  });

  it("computes revised Harris-Benedict for a female", () => {
    const input: BmrInput = { formula: "harris_benedict", sex: "female", ageYears: 28, weightKg: 60, heightCm: 165 };
    // 9.247*60 + 3.098*165 - 4.330*28 + 447.593 = 554.82 + 511.17 - 121.24 + 447.593
    expect(calculateBmr(input)).toBe(1392);
  });

  it("computes Katch-McArdle from lean body mass", () => {
    const input: BmrInput = {
      formula: "katch_mcardle",
      sex: "male",
      ageYears: 30,
      weightKg: 80,
      heightCm: 180,
      bodyFatPercent: 15,
    };
    // LBM = 80 * 0.85 = 68; BMR = 370 + 21.6*68 = 370 + 1468.8
    expect(calculateBmr(input)).toBe(1839);
  });

  it("throws for Katch-McArdle without a body fat percentage", () => {
    const input: BmrInput = { formula: "katch_mcardle", sex: "male", ageYears: 30, weightKg: 80, heightCm: 180 };
    expect(() => calculateBmr(input)).toThrow();
  });
});

describe("calculateTdee", () => {
  it.each([
    ["sedentary", 1.2],
    ["light", 1.375],
    ["moderate", 1.55],
    ["active", 1.725],
    ["very_active", 1.9],
  ] as const)("applies the %s activity multiplier", (level, multiplier) => {
    expect(calculateTdee(1800, level)).toBe(Math.round(1800 * multiplier));
  });
});

describe("estimateBodyFatNavy", () => {
  it("estimates body fat percent for a male from neck and waist", () => {
    const result = estimateBodyFatNavy({ sex: "male", heightCm: 180, neckCm: 38, waistCm: 85 });
    // 495 / (1.0324 - 0.19077*log10(85-38) + 0.15456*log10(180)) - 450 ≈ 16.1
    expect(result).toBeCloseTo(16, 0);
  });

  it("estimates body fat percent for a female from neck, waist, and hip", () => {
    const result = estimateBodyFatNavy({ sex: "female", heightCm: 165, neckCm: 32, waistCm: 70, hipCm: 95 });
    // 495 / (1.29579 - 0.35004*log10(70+95-32) + 0.22100*log10(165)) - 450 ≈ 24.9
    expect(result).toBeCloseTo(25, 0);
  });

  it("throws for a female measurement missing hip", () => {
    expect(() => estimateBodyFatNavy({ sex: "female", heightCm: 165, neckCm: 32, waistCm: 70 })).toThrow();
  });
});
