// Fixed vocabularies so the kanban view has a bounded, consistent set of
// columns instead of fragmenting on free-text typos ("Legs" vs "legs").
// muscle_group itself has no DB constraint (coaches can still search/filter
// on anything already in the seed data), but the create-exercise form only
// offers these — food category IS DB-constrained (see migration
// 20260731000014_food_category.sql), so this list must match it exactly.
export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "legs",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "cardio",
  "full_body",
  "other",
] as const;

export const FOOD_CATEGORIES = [
  "protein",
  "carbs",
  "fats",
  "vegetables",
  "fruits",
  "dairy",
  "other",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];
