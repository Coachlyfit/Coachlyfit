import { z } from "zod";

// Same shape as programs/schemas.ts's createProgramSchema — client_id
// nullable = template; "" is RHF's "no client picked" state, handled
// explicitly since z.string().uuid() alone rejects it.
export const createDietPlanSchema = z
  .object({
    client_id: z.string().uuid().optional().or(z.literal("")),
    name_ar: z.string().min(1).max(100),
    name_en: z.string().min(1).max(100),
    start_date: z.string().optional().or(z.literal("")),
    end_date: z.string().optional().or(z.literal("")),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: "end_date_before_start_date",
    path: ["end_date"],
  });

// No day_index — meals table has no such column (a flat ordered list, not
// day-indexed like program_days), unlike programs/schemas.ts's daySchema.
export const mealSchema = z.object({
  label_ar: z.string().max(60).optional().or(z.literal("")),
  label_en: z.string().max(60).optional().or(z.literal("")),
});

// Much simpler than programs/schemas.ts's itemSchema — no sets field array,
// meal_items is just {food_id, quantity, unit}.
export const mealItemSchema = z.object({
  food_id: z.string().uuid(),
  quantity: z.coerce.number().min(0.1).max(100),
  unit: z.string().min(1).max(30),
});

export const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

// Names for the template a coach saves out of an assigned plan — same
// bounds as createDietPlanSchema's name_ar/name_en.
export const saveAsTemplateSchema = z.object({
  name_ar: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
});

export type CreateDietPlanInput = z.infer<typeof createDietPlanSchema>;
export type MealFormInput = z.input<typeof mealSchema>;
export type MealItemFormInput = z.input<typeof mealItemSchema>;
export type MealItemInput = z.output<typeof mealItemSchema>;
export type SaveAsTemplateInput = z.infer<typeof saveAsTemplateSchema>;
