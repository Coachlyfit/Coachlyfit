export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type BmrFormula = "mifflin_st_jeor" | "harris_benedict" | "katch_mcardle";

export type BmrInput = {
  formula: BmrFormula;
  sex: Sex;
  ageYears: number;
  weightKg: number;
  heightCm: number;
  /** Required only by katch_mcardle — that formula works off lean body mass, not sex/age. */
  bodyFatPercent?: number | null;
};

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** BMR in kcal/day. Mifflin-St Jeor and revised Harris-Benedict both need
 * sex — the additive constant differs by ~150-300kcal between them. Katch-McArdle
 * skips sex/age entirely and works off lean body mass, so it's the more
 * accurate choice whenever a body fat % is already on hand. */
export function calculateBmr(input: BmrInput): number {
  switch (input.formula) {
    case "mifflin_st_jeor": {
      const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears;
      return Math.round(input.sex === "male" ? base + 5 : base - 161);
    }
    case "harris_benedict": {
      return Math.round(
        input.sex === "male"
          ? 13.397 * input.weightKg + 4.799 * input.heightCm - 5.677 * input.ageYears + 88.362
          : 9.247 * input.weightKg + 3.098 * input.heightCm - 4.33 * input.ageYears + 447.593,
      );
    }
    case "katch_mcardle": {
      if (input.bodyFatPercent == null) {
        throw new Error("katch_mcardle requires bodyFatPercent");
      }
      const leanMassKg = input.weightKg * (1 - input.bodyFatPercent / 100);
      return Math.round(370 + 21.6 * leanMassKg);
    }
  }
}

/** Total daily energy expenditure — BMR scaled by the classic five-tier
 * activity multiplier used alongside all three BMR formulas above. */
export function calculateTdee(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

export type NavyBodyFatInput = {
  sex: Sex;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  /** Required for female — the formula folds hip circumference into the waist term. */
  hipCm?: number | null;
};

/** US Navy circumference method (Hodgdon & Beckett, 1984). Tape-measure
 * estimate, not a substitute for a real body fat measurement — good enough
 * to seed the Katch-McArdle formula above from numbers a coach can take
 * with a tape measure. */
export function estimateBodyFatNavy(input: NavyBodyFatInput): number {
  const heightTerm = Math.log10(input.heightCm);

  if (input.sex === "male") {
    const circumferenceTerm = Math.log10(input.waistCm - input.neckCm);
    const denominator = 1.0324 - 0.19077 * circumferenceTerm + 0.15456 * heightTerm;
    return 495 / denominator - 450;
  }

  if (input.hipCm == null) {
    throw new Error("estimateBodyFatNavy requires hipCm for sex 'female'");
  }
  const circumferenceTerm = Math.log10(input.waistCm + input.hipCm - input.neckCm);
  const denominator = 1.29579 - 0.35004 * circumferenceTerm + 0.221 * heightTerm;
  return 495 / denominator - 450;
}
