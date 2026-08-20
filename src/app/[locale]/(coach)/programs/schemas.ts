import { z } from "zod";

// client_id nullable = template. z.string().uuid() alone rejects "" — RHF's
// "no client picked" state — so the empty-string branch is explicit and the
// action normalizes "" -> null before calling the service.
export const createProgramSchema = z
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

export const daySchema = z.object({
  day_index: z.coerce.number().int().min(1).max(30),
  label_ar: z.string().max(60).optional().or(z.literal("")),
  label_en: z.string().max(60).optional().or(z.literal("")),
});

// One prescribed set — reps/weight/rest, individually editable. weight is
// nullable (bodyweight exercises); rest_seconds nullable so a set can leave
// the exercise's default rest unset rather than forcing 0.
export const setInputSchema = z.object({
  reps: z.coerce.number().int().min(1).max(100),
  weight: z.coerce.number().min(0).max(1000).nullable().optional(),
  rest_seconds: z.coerce.number().int().min(0).max(900).nullable().optional(),
});

export const progressionRuleSchema = z.enum(["none", "plus_2_5kg_week", "plus_5kg_week", "plus_1_rep_week"]);

export const itemSchema = z.object({
  exercise_id: z.string().uuid(),
  sets: z.array(setInputSchema).min(1).max(20),
  progression_rule: progressionRuleSchema.default("none"),
  notes_ar: z.string().max(300).optional().or(z.literal("")),
  notes_en: z.string().max(300).optional().or(z.literal("")),
});

export const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

export type CreateProgramInput = z.infer<typeof createProgramSchema>;
// z.coerce.number() fields make the schema's input type (what RHF's number
// inputs actually hand it, pre-validation) diverge from its output type —
// same split as CreateFoodFormInput/CreateFoodInput in the library schemas.
export type DayFormInput = z.input<typeof daySchema>;
export type DayInput = z.output<typeof daySchema>;
export type SetFormInput = z.input<typeof setInputSchema>;
export type ItemFormInput = z.input<typeof itemSchema>;
export type ItemInput = z.output<typeof itemSchema>;
