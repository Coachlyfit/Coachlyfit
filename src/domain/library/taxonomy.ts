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

// The equipment values the curated (global) exercises actually carry after
// 20261006000001_library_facets.sql normalized them, most common first.
// `equipment` is still free text for a coach's own rows, so anything outside
// this list is shown as typed and isn't offered in the filter.
export const EQUIPMENT = [
  "body weight",
  "dumbbell",
  "barbell",
  "cable",
  "leverage machine",
  "band",
  "smith machine",
  "kettlebell",
  "weighted",
  "none",
  "stability ball",
  "ez barbell",
  "assisted",
  "sled machine",
  "medicine ball",
  "rope",
  "machine",
  "roller",
  "bosu ball",
  "olympic barbell",
  "wheel roller",
  "trap bar",
  "skierg machine",
  "stationary bike",
  "elliptical machine",
  "upper body ergometer",
  "hammer",
  "tire",
  "stepmill machine",
] as const;

export type Equipment = (typeof EQUIPMENT)[number];

/** Message key under `library.equipment` for a stored equipment value, or
 * null when it's coach free text with no translation. */
export function equipmentKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || !(EQUIPMENT as readonly string[]).includes(normalized)) return null;
  return normalized.replaceAll(" ", "_");
}

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

/** muscle_group has no DB constraint (see above), so a value read back from
 * the database can be free text a coach typed before this vocabulary existed
 * — guards every `tGroups(...)` call against a missing translation key. */
export function isKnownMuscleGroup(value: string | null | undefined): value is MuscleGroup {
  return !!value && (MUSCLE_GROUPS as readonly string[]).includes(value);
}
