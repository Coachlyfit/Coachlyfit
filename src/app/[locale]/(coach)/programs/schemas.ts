import { z } from "zod";
import { DAY_SECTION_KEYS } from "@/domain/programs/day-sections";

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

// diet_plan_id is deliberately not part of this schema — it's set only by
// setDayNutritionAction (the nutrition assignment grid), which validates
// the plan belongs to this program. Keeping it off the day-edit form means
// a stale/absent field there can never accidentally clear a day's linked
// variant.
export const daySchema = z.object({
  day_index: z.coerce.number().int().min(1).max(30),
  label_ar: z.string().max(60).optional().or(z.literal("")),
  label_en: z.string().max(60).optional().or(z.literal("")),
  weekday: weekdaySchema,
  notes_ar: z.string().max(500).optional().or(z.literal("")),
  notes_en: z.string().max(500).optional().or(z.literal("")),
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

// One prescribed set — either reps-based (weight/rest, as before) or
// duration-based (a rehab hold, a stretch: duration_seconds instead of
// reps). The refine mirrors the DB's program_item_sets_reps_or_duration
// check: exactly one of reps/duration_seconds must be set, never both,
// never neither.
export const setInputSchema = z
  .object({
    reps: optionalCoercedNumber(z.coerce.number().int().min(1).max(100).nullable().optional()),
    duration_seconds: optionalCoercedNumber(z.coerce.number().int().min(1).max(3600).nullable().optional()),
    weight: optionalCoercedNumber(z.coerce.number().min(0).max(1000).nullable().optional()),
    rest_seconds: optionalCoercedNumber(z.coerce.number().int().min(0).max(900).nullable().optional()),
  })
  .refine((v) => (v.reps != null) !== (v.duration_seconds != null), {
    message: "reps_xor_duration",
    path: ["reps"],
  });

export const progressionRuleSchema = z.enum(["none", "plus_2_5kg_week", "plus_5kg_week", "plus_1_rep_week"]);

export const blockSchema = z.enum(["warmup", "main", "cooldown", "mobility", "rehab"]);

export const itemSchema = z.object({
  exercise_id: z.string().uuid(),
  sets: z.array(setInputSchema).min(1).max(20),
  progression_rule: progressionRuleSchema.default("none"),
  notes_ar: z.string().max(300).optional().or(z.literal("")),
  notes_en: z.string().max(300).optional().or(z.literal("")),
  block: blockSchema.default("main"),
  rehab_phase_id: z.string().uuid().optional().or(z.literal("")),
  coach_note_private: z.string().max(1000).optional().or(z.literal("")),
});

export const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

// One day's section order. The service normalizes (and appends any section
// missing from an older row); this only rejects unknown keys and oversized
// arrays before they reach the DB.
export const sectionOrderSchema = z.object({
  order: z.array(z.enum(DAY_SECTION_KEYS)).min(1).max(DAY_SECTION_KEYS.length),
});

const MODALITIES = [
  "walking", "running", "cycling", "rowing", "stairmaster", "swimming", "elliptical", "hiit", "other",
  "foam_rolling", "stretching", "massage", "sauna", "cold_plunge", "breathwork",
] as const;

export const activitySchema = z.object({
  kind: z.enum(["cardio", "recovery"]),
  modality: z.enum(MODALITIES),
  duration_min: optionalCoercedNumber(z.coerce.number().int().min(1).max(600).nullable().optional()),
  distance_km: optionalCoercedNumber(z.coerce.number().min(0.01).max(500).nullable().optional()),
  intensity: z.enum(["low", "moderate", "high", "intervals"]).optional().or(z.literal("")),
  hr_zone: optionalCoercedNumber(z.coerce.number().int().min(1).max(5).nullable().optional()),
  kcal_target: optionalCoercedNumber(z.coerce.number().int().min(1).max(5000).nullable().optional()),
  pace: z.string().max(30).optional().or(z.literal("")),
  notes_ar: z.string().max(300).optional().or(z.literal("")),
  notes_en: z.string().max(300).optional().or(z.literal("")),
  log_required: z.coerce.boolean().default(true),
});

export const rehabProtocolSchema = z.object({
  body_area: z.string().min(1).max(80),
  injury_ar: z.string().max(300).optional().or(z.literal("")),
  injury_en: z.string().max(300).optional().or(z.literal("")),
  restrictions_ar: z.string().max(500).optional().or(z.literal("")),
  restrictions_en: z.string().max(500).optional().or(z.literal("")),
  instructions_ar: z.string().max(1000).optional().or(z.literal("")),
  instructions_en: z.string().max(1000).optional().or(z.literal("")),
});

export const rehabPhaseSchema = z
  .object({
    name_ar: z.string().min(1).max(60),
    name_en: z.string().min(1).max(60),
    from_week: z.coerce.number().int().min(1).max(12),
    to_week: z.coerce.number().int().min(1).max(12),
    goals_ar: z.string().max(300).optional().or(z.literal("")),
    goals_en: z.string().max(300).optional().or(z.literal("")),
    progression_criteria_ar: z.string().max(300).optional().or(z.literal("")),
    progression_criteria_en: z.string().max(300).optional().or(z.literal("")),
  })
  .refine((v) => v.from_week <= v.to_week, { message: "from_week_after_to_week", path: ["to_week"] });

export const setDayNutritionSchema = z.object({
  dayIds: z.array(z.string().uuid()).min(1).max(30),
  dietPlanId: z.string().uuid().nullable(),
});

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
export type ActivityFormInput = z.input<typeof activitySchema>;
export type ActivityInput = z.output<typeof activitySchema>;
export type RehabProtocolInput = z.infer<typeof rehabProtocolSchema>;
export type RehabPhaseFormInput = z.input<typeof rehabPhaseSchema>;
export type RehabPhaseInput = z.output<typeof rehabPhaseSchema>;
