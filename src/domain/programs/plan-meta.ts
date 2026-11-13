/** Plan-level metadata a coach can tag a program with. The lists mirror the
 * CHECK constraints in 20261114000001_plan_types_and_timed_blocks.sql — change
 * both together. Labels live in messages/*.json under programs.planTypes /
 * goals / levels, keyed by these exact values. */

export const PLAN_TYPES = [
  "strength",
  "hypertrophy",
  "crossfit",
  "hyrox",
  "combat",
  "calisthenics",
  "hybrid",
  "endurance",
  "hiit",
  "mobility",
  "general",
  "sport",
  "weightlifting",
  "home",
] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const PLAN_GOALS = ["strength", "muscle", "fat_loss", "endurance", "performance", "mobility", "general"] as const;
export type PlanGoal = (typeof PLAN_GOALS)[number];

export const PLAN_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type PlanLevel = (typeof PLAN_LEVELS)[number];

/** Narrows a free-form DB string (the columns are plain text + CHECK, so the
 * generated type is `string | null`) to a known value, or null. */
export function asPlanType(v: string | null | undefined): PlanType | null {
  return (PLAN_TYPES as readonly string[]).includes(v ?? "") ? (v as PlanType) : null;
}
export function asPlanGoal(v: string | null | undefined): PlanGoal | null {
  return (PLAN_GOALS as readonly string[]).includes(v ?? "") ? (v as PlanGoal) : null;
}
export function asPlanLevel(v: string | null | undefined): PlanLevel | null {
  return (PLAN_LEVELS as readonly string[]).includes(v ?? "") ? (v as PlanLevel) : null;
}

/** Equipment a program can be tagged with — a short, program-relevant subset
 * of the library's EQUIPMENT vocabulary (src/domain/library/taxonomy.ts), so
 * labels reuse `library.equipment.*` and a program's tags match exercise
 * equipment values exactly. */
export const PLAN_EQUIPMENT = [
  "body weight",
  "dumbbell",
  "barbell",
  "kettlebell",
  "band",
  "cable",
  "machine",
  "medicine ball",
  "rope",
  "stationary bike",
  "skierg machine",
  "sled machine",
] as const;
