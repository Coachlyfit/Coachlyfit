import { z } from "zod";

// z.coerce.number() runs Number(value) BEFORE the nullable/optional checks,
// and Number("") is 0 — same "" -> undefined preprocessing as
// programs/schemas.ts's optionalCoercedNumber, so an empty target input
// reads as "no target set" instead of a real 0 kcal/g target.
function optionalCoercedNumber<S extends z.ZodTypeAny>(schema: S) {
  return z.preprocess((v) => (v === "" || v === null ? undefined : v), schema);
}

// Same shape as programs/schemas.ts's createProgramSchema — client_id
// nullable = template; "" is RHF's "no client picked" state, handled
// explicitly since z.string().uuid() alone rejects it. target_* are
// optional macro targets shown against the plan's computed totals
// (macros.ts's targetDelta) — meaningful for both a standalone plan and a
// program-owned nutrition variant.
export const createDietPlanSchema = z
  .object({
    client_id: z.string().uuid().optional().or(z.literal("")),
    name_ar: z.string().min(1).max(100),
    name_en: z.string().min(1).max(100),
    start_date: z.string().optional().or(z.literal("")),
    end_date: z.string().optional().or(z.literal("")),
    target_kcal: optionalCoercedNumber(z.coerce.number().int().min(1).max(10000).nullable().optional()),
    target_protein_g: optionalCoercedNumber(z.coerce.number().min(0).max(1000).nullable().optional()),
    target_carb_g: optionalCoercedNumber(z.coerce.number().min(0).max(1000).nullable().optional()),
    target_fat_g: optionalCoercedNumber(z.coerce.number().min(0).max(1000).nullable().optional()),
    notes_ar: z.string().max(500).optional().or(z.literal("")),
    notes_en: z.string().max(500).optional().or(z.literal("")),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: "end_date_before_start_date",
    path: ["end_date"],
  });

// The targets-only subset, for editing a variant/plan's macro targets
// separately from its name/dates (the macro sidebar's own small form).
export const dietTargetsSchema = z.object({
  target_kcal: optionalCoercedNumber(z.coerce.number().int().min(1).max(10000).nullable().optional()),
  target_protein_g: optionalCoercedNumber(z.coerce.number().min(0).max(1000).nullable().optional()),
  target_carb_g: optionalCoercedNumber(z.coerce.number().min(0).max(1000).nullable().optional()),
  target_fat_g: optionalCoercedNumber(z.coerce.number().min(0).max(1000).nullable().optional()),
});

// No day_index — meals table has no such column (a flat ordered list, not
// day-indexed like program_days), unlike programs/schemas.ts's daySchema.
// time_of_day is meal timing ("12:30"), never required.
export const mealSchema = z.object({
  label_ar: z.string().max(60).optional().or(z.literal("")),
  label_en: z.string().max(60).optional().or(z.literal("")),
  time_of_day: z.string().optional().or(z.literal("")),
});

// Much simpler than programs/schemas.ts's itemSchema — no sets field array,
// meal_items is just {food_id, quantity, unit}.
export const mealItemSchema = z.object({
  food_id: z.string().uuid(),
  quantity: z.coerce.number().min(0.1).max(100),
  unit: z.string().min(1).max(30),
});

// A recipe in a meal: quantity is the number of recipe servings, unit is
// always "serving" (set by the service).
export const mealRecipeItemSchema = z.object({
  recipe_id: z.string().uuid(),
  quantity: z.coerce.number().min(0.1).max(100),
});

export const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

// Names for the template a coach saves out of an assigned plan — same
// bounds as createDietPlanSchema's name_ar/name_en.
export const saveAsTemplateSchema = z.object({
  name_ar: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
});

// Renaming only — same 100-char ceiling as the create form, trimmed so a
// whitespace-only name is rejected instead of saved as blank.
export const renameSchema = z.object({
  name_ar: z.string().trim().min(1).max(100),
  name_en: z.string().trim().min(1).max(100),
});

// target_* use z.coerce.number(), which makes the schema's input type (what
// RHF's number inputs actually hand it, pre-validation) diverge from its
// output type — same z.input/z.output split as programs/schemas.ts's
// CreateProgramFormInput/CreateProgramInput.
export type CreateDietPlanFormInput = z.input<typeof createDietPlanSchema>;
export type CreateDietPlanInput = z.output<typeof createDietPlanSchema>;
export type DietTargetsFormInput = z.input<typeof dietTargetsSchema>;
export type DietTargetsInput = z.output<typeof dietTargetsSchema>;
export type MealFormInput = z.input<typeof mealSchema>;
export type MealItemFormInput = z.input<typeof mealItemSchema>;
export type MealItemInput = z.output<typeof mealItemSchema>;
export type SaveAsTemplateInput = z.infer<typeof saveAsTemplateSchema>;
export type RenameFormInput = z.infer<typeof renameSchema>;
