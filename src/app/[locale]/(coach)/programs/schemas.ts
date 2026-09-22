import { z } from "zod";

export const scheduleModeSchema = z.enum(["cycle", "weekly"]);

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
    schedule_mode: scheduleModeSchema.default("cycle"),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: "end_date_before_start_date",
    path: ["end_date"],
  });

// 0-6, Date.getUTCDay() convention (0 = Sunday) — matches program_days.weekday
// and program-cycle.ts's dayIndexForDateWithMode. Only meaningful in weekly
// schedule_mode; "" (no weekday picked) is preprocessed to undefined the
// same way optionalCoercedNumber below handles a blank number input.
export const weekdaySchema = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().int().min(0).max(6).optional()
);

export const daySchema = z.object({
  day_index: z.coerce.number().int().min(1).max(30),
  label_ar: z.string().max(60).optional().or(z.literal("")),
  label_en: z.string().max(60).optional().or(z.literal("")),
  weekday: weekdaySchema,
});

// z.coerce.number() runs Number(value) BEFORE the nullable/optional checks,
// and Number("") is 0, not NaN — so an empty number input silently coerces
// to 0 instead of "unset". That's wrong for weight (0kg reads as a real
// prescribed load, not bodyweight) and for rest_seconds (0s reads as "no
// rest", not "use the exercise's default"). Preprocessing "" -> undefined
// first lets `.optional()` short-circuit before coercion ever runs.
function optionalCoercedNumber<S extends z.ZodTypeAny>(schema: S) {
  return z.preprocess((v) => (v === "" || v === null ? undefined : v), schema);
}

// One prescribed set — reps/weight/rest, individually editable. weight is
// nullable (bodyweight exercises); rest_seconds nullable so a set can leave
// the exercise's default rest unset rather than forcing 0.
export const setInputSchema = z.object({
  reps: z.coerce.number().int().min(1).max(100),
  weight: optionalCoercedNumber(z.coerce.number().min(0).max(1000).nullable().optional()),
  rest_seconds: optionalCoercedNumber(z.coerce.number().int().min(0).max(900).nullable().optional()),
});

export const progressionRuleSchema = z.enum(["none", "plus_2_5kg_week", "plus_5kg_week", "plus_1_rep_week"]);

export const blockSchema = z.enum(["warmup", "main", "cooldown"]);

export const itemSchema = z.object({
  exercise_id: z.string().uuid(),
  sets: z.array(setInputSchema).min(1).max(20),
  progression_rule: progressionRuleSchema.default("none"),
  notes_ar: z.string().max(300).optional().or(z.literal("")),
  notes_en: z.string().max(300).optional().or(z.literal("")),
  block: blockSchema.default("main"),
  coach_note_private: z.string().max(1000).optional().or(z.literal("")),
});

export const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

// Names for the template a coach saves out of an assigned program — same
// bounds as createProgramSchema's name_ar/name_en.
export const saveAsTemplateSchema = z.object({
  name_ar: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
});

// schedule_mode has a zod .default(), which makes RHF's input type (what the
// form actually manages before validation) diverge from the output type
// (schedule_mode always present after parsing) — same z.input/z.output split
// as DayFormInput/DayInput below.
export type CreateProgramFormInput = z.input<typeof createProgramSchema>;
export type CreateProgramInput = z.output<typeof createProgramSchema>;
// z.coerce.number() fields make the schema's input type (what RHF's number
// inputs actually hand it, pre-validation) diverge from its output type —
// same split as CreateFoodFormInput/CreateFoodInput in the library schemas.
export type DayFormInput = z.input<typeof daySchema>;
export type DayInput = z.output<typeof daySchema>;
export type SetFormInput = z.input<typeof setInputSchema>;
export type ItemFormInput = z.input<typeof itemSchema>;
export type ItemInput = z.output<typeof itemSchema>;
export type SaveAsTemplateInput = z.infer<typeof saveAsTemplateSchema>;
