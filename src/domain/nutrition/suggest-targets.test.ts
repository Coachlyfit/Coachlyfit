import { describe, expect, it } from "vitest";
import { ageOn, suggestMacroTargets, targetsSource, type SuggestInput } from "./suggest-targets";

const today = new Date(Date.UTC(2026, 8, 30)); // 2026-09-30

const base: SuggestInput = {
  weightKg: 80,
  heightCm: 180,
  birthDate: "1996-06-15", // 30 on `today`
  sex: "male",
  activityLevel: "moderate",
  goal: "maintain",
};

describe("ageOn", () => {
  it("counts whole years, not yet a year older the day before a birthday", () => {
    expect(ageOn("1996-06-15", today)).toBe(30);
    expect(ageOn("2000-10-01", today)).toBe(25);
    expect(ageOn("2000-09-30", today)).toBe(26);
  });

  it("rejects a malformed date", () => {
    expect(ageOn("30/09/2000", today)).toBeNull();
  });
});

describe("suggestMacroTargets", () => {
  it("maintain: Mifflin BMR × activity, protein 1.8g/kg, fat 25%, carbs remainder", () => {
    const result = suggestMacroTargets(base, today);
    // BMR = 10·80 + 6.25·180 − 5·30 + 5 = 1780; TDEE = 1780 × 1.55 = 2759
    expect(result).toMatchObject({
      ok: true,
      bmr: 1780,
      tdee: 2759,
      ageYears: 30,
      warnings: [],
      targets: { kcal: 2760, protein_g: 144, fat_g: 77, carb_g: 373 },
    });
  });

  it("cut: 20% deficit and more protein per kg", () => {
    const result = suggestMacroTargets({ ...base, goal: "cut" }, today);
    expect(result).toMatchObject({ ok: true, targets: { kcal: 2210, protein_g: 176, fat_g: 61, carb_g: 239 } });
  });

  it("bulk: 10% surplus", () => {
    const result = suggestMacroTargets({ ...base, goal: "bulk" }, today);
    expect(result.ok && result.targets.kcal).toBe(3030);
  });

  it("macros add back up to kcal within rounding", () => {
    for (const goal of ["cut", "maintain", "bulk"] as const) {
      const result = suggestMacroTargets({ ...base, goal }, today);
      if (!result.ok) throw new Error("expected ok");
      const { kcal, protein_g, carb_g, fat_g } = result.targets;
      expect(Math.abs(protein_g * 4 + carb_g * 4 + fat_g * 9 - kcal)).toBeLessThanOrEqual(10);
    }
  });

  it("reports every missing field by name instead of guessing", () => {
    const result = suggestMacroTargets(
      { weightKg: null, heightCm: null, birthDate: null, sex: null, activityLevel: null, goal: null },
      today
    );
    expect(result).toEqual({
      ok: false,
      missing: ["weight", "height", "birthDate", "sex", "activityLevel", "goal"],
      invalid: [],
    });
  });

  it("reports a single missing field", () => {
    expect(suggestMacroTargets({ ...base, sex: null }, today)).toEqual({ ok: false, missing: ["sex"], invalid: [] });
  });

  it("flags implausible values as invalid", () => {
    const result = suggestMacroTargets({ ...base, weightKg: 400, heightCm: 60, birthDate: "2020-01-01" }, today);
    expect(result).toEqual({ ok: false, missing: [], invalid: ["weight", "height", "birthDate"] });
  });

  it("accepts values exactly on the range boundaries", () => {
    expect(suggestMacroTargets({ ...base, weightKg: 30, heightCm: 100 }, today).ok).toBe(true);
    expect(suggestMacroTargets({ ...base, weightKg: 300, heightCm: 250 }, today).ok).toBe(true);
    expect(suggestMacroTargets({ ...base, birthDate: "2012-09-30" }, today).ok).toBe(true); // exactly 14
    expect(suggestMacroTargets({ ...base, birthDate: "2012-10-01" }, today).ok).toBe(false); // 13
  });

  it("rejects non-finite numbers", () => {
    expect(suggestMacroTargets({ ...base, weightKg: Number.NaN }, today)).toMatchObject({ ok: false, invalid: ["weight"] });
  });

  it("never goes below the sex-specific kcal floor", () => {
    const result = suggestMacroTargets(
      { weightKg: 45, heightCm: 150, birthDate: "1966-01-01", sex: "female", activityLevel: "sedentary", goal: "cut" },
      today
    );
    expect(result).toMatchObject({ ok: true, targets: { kcal: 1200 }, warnings: ["kcal_floor_applied"] });
  });

  it("floors carbs at zero and warns when protein + fat already exceed kcal", () => {
    const result = suggestMacroTargets(
      { weightKg: 300, heightCm: 150, birthDate: "1946-01-01", sex: "female", activityLevel: "sedentary", goal: "cut" },
      today
    );
    expect(result).toMatchObject({ ok: true, targets: { protein_g: 660, carb_g: 0 }, warnings: ["low_carb"] });
  });
});

describe("targetsSource", () => {
  const suggested = { kcal: 2000, protein_g: 150, carb_g: 200, fat_g: 60 };

  it("is 'suggested' when every value is kept", () => {
    expect(targetsSource(suggested, { ...suggested })).toBe("suggested");
  });

  it("is 'suggested_edited' when any value changes", () => {
    expect(targetsSource(suggested, { ...suggested, fat_g: 65 })).toBe("suggested_edited");
  });
});
