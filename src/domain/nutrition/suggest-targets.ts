import { calculateBmr, calculateTdee, type ActivityLevel, type Sex } from "./calories";

export type Goal = "cut" | "maintain" | "bulk";

export type SuggestInput = {
  weightKg: number | null;
  heightCm: number | null;
  /** ISO YYYY-MM-DD. Age is derived against `today`, not stored, so it never goes stale. */
  birthDate: string | null;
  sex: Sex | null;
  activityLevel: ActivityLevel | null;
  goal: Goal | null;
};

export type SuggestField = "weight" | "height" | "birthDate" | "sex" | "activityLevel" | "goal";

export type SuggestedTargets = {
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
};

export type SuggestWarning = "kcal_floor_applied" | "low_carb";

export type SuggestResult =
  | {
      ok: true;
      targets: SuggestedTargets;
      /** Intermediate numbers, kept with the assigned targets so a coach can see how they were reached. */
      bmr: number;
      tdee: number;
      ageYears: number;
      warnings: SuggestWarning[];
    }
  | { ok: false; missing: SuggestField[]; invalid: SuggestField[] };

// Outside these the formulas stop meaning much (Mifflin-St Jeor was fit on
// adults of ordinary build), so the coach is told instead of shown a number.
export const WEIGHT_RANGE_KG = [30, 300] as const;
export const HEIGHT_RANGE_CM = [100, 250] as const;
export const AGE_RANGE_YEARS = [14, 100] as const;

const GOAL_KCAL_FACTOR: Record<Goal, number> = { cut: 0.8, maintain: 1, bulk: 1.1 };
const PROTEIN_G_PER_KG: Record<Goal, number> = { cut: 2.2, maintain: 1.8, bulk: 2.0 };
const FAT_SHARE_OF_KCAL = 0.25;
// Common clinical floor below which an unsupervised deficit isn't advised.
const KCAL_FLOOR: Record<Sex, number> = { female: 1200, male: 1500 };

function inRange(value: number, [min, max]: readonly [number, number]): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/** Whole years between an ISO birth date and `today`, both read as UTC
 * calendar dates (same reasoning as progress/stats.ts: no local-time parse). */
export function ageOn(birthDate: string, today: Date): number | null {
  const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  let age = today.getUTCFullYear() - y;
  const beforeBirthday = today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d);
  if (beforeBirthday) age--;
  return age;
}

/** Daily kcal + macro targets: Mifflin-St Jeor BMR × activity factor,
 * scaled by goal; protein by bodyweight, fat as a share of kcal, carbs the
 * remainder. Never guesses: any missing or implausible input is reported
 * back by name instead of producing numbers. */
export function suggestMacroTargets(input: SuggestInput, today: Date): SuggestResult {
  const missing: SuggestField[] = [];
  const invalid: SuggestField[] = [];

  if (input.weightKg == null) missing.push("weight");
  else if (!inRange(input.weightKg, WEIGHT_RANGE_KG)) invalid.push("weight");

  if (input.heightCm == null) missing.push("height");
  else if (!inRange(input.heightCm, HEIGHT_RANGE_CM)) invalid.push("height");

  let ageYears: number | null = null;
  if (input.birthDate == null) missing.push("birthDate");
  else {
    ageYears = ageOn(input.birthDate, today);
    if (ageYears == null || !inRange(ageYears, AGE_RANGE_YEARS)) invalid.push("birthDate");
  }

  if (input.sex == null) missing.push("sex");
  if (input.activityLevel == null) missing.push("activityLevel");
  if (input.goal == null) missing.push("goal");

  if (missing.length > 0 || invalid.length > 0) return { ok: false, missing, invalid };

  // Every field is present and in range past this point.
  const weightKg = input.weightKg!;
  const sex = input.sex!;
  const goal = input.goal!;

  const bmr = calculateBmr({
    formula: "mifflin_st_jeor",
    sex,
    ageYears: ageYears!,
    weightKg,
    heightCm: input.heightCm!,
  });
  const tdee = calculateTdee(bmr, input.activityLevel!);

  const warnings: SuggestWarning[] = [];
  let kcal = Math.round((tdee * GOAL_KCAL_FACTOR[goal]) / 10) * 10;
  if (kcal < KCAL_FLOOR[sex]) {
    kcal = KCAL_FLOOR[sex];
    warnings.push("kcal_floor_applied");
  }

  const protein_g = Math.round(weightKg * PROTEIN_G_PER_KG[goal]);
  const fat_g = Math.round((kcal * FAT_SHARE_OF_KCAL) / 9);
  let carb_g = Math.round((kcal - protein_g * 4 - fat_g * 9) / 4);
  if (carb_g < 0) {
    carb_g = 0;
    warnings.push("low_carb");
  }

  return { ok: true, targets: { kcal, protein_g, carb_g, fat_g }, bmr, tdee, ageYears: ageYears!, warnings };
}

/** "suggested" when the coach assigns the suggestion untouched,
 * "suggested_edited" once any value differs from it. */
export function targetsSource(suggested: SuggestedTargets, assigned: SuggestedTargets): "suggested" | "suggested_edited" {
  const same =
    suggested.kcal === assigned.kcal &&
    suggested.protein_g === assigned.protein_g &&
    suggested.carb_g === assigned.carb_g &&
    suggested.fat_g === assigned.fat_g;
  return same ? "suggested" : "suggested_edited";
}
