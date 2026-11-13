import { z } from "zod";
import { DAY_SECTION_KEYS } from "@/domain/programs/day-sections";
import { GROUP_KINDS } from "@/domain/programs/group-config";
import { SET_TYPES } from "@/domain/programs/set-targets";
import { PLAN_EQUIPMENT, PLAN_GOALS, PLAN_LEVELS, PLAN_TYPES } from "@/domain/programs/plan-meta";

export const scheduleModeSchema = z.enum(["cycle", "weekly"]);

// Plan metadata. "" is the form's "not set" state (a Select's cleared value),
// normalized to null by the action — same idiom as client_id below.
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).optional().or(z.literal(""));

export const planMetaShape = {
  plan_type: optionalEnum(PLAN_TYPES),
  goal: optionalEnum(PLAN_GOALS),
  level: optionalEnum(PLAN_LEVELS),
  equipment: z.array(z.enum(PLAN_EQUIPMENT)).max(PLAN_EQUIPMENT.length).optional(),
};

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
    ...planMetaShape,
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

// Numeric extra metrics a set can carry besides the five columns
// (EXTRA_KEYS in library/measurement.ts is the single list of names). Blank
// inputs preprocess to undefined and are dropped; an all-blank object becomes
// null, because the DB's has_measure check treats ANY non-null `extra` as a
// measure and `{}` must not satisfy it.
const extraSchema = z
  .object({
    rounds: optionalCoercedNumber(z.coerce.number().int().min(1).max(100).optional()),
    work_s: optionalCoercedNumber(z.coerce.number().int().min(1).max(3600).optional()),
    rest_s: optionalCoercedNumber(z.coerce.number().int().min(0).max(3600).optional()),
    level: optionalCoercedNumber(z.coerce.number().min(0).max(100).optional()),
    incline: optionalCoercedNumber(z.coerce.number().min(-10).max(100).optional()),
    speed: optionalCoercedNumber(z.coerce.number().min(0).max(100).optional()),
    laps: optionalCoercedNumber(z.coerce.number().int().min(1).max(1000).optional()),
    steps: optionalCoercedNumber(z.coerce.number().int().min(1).max(200000).optional()),
  })
  .nullable()
  .optional()
  .transform((value) => {
    if (!value) return null;
    const kept = Object.fromEntries(Object.entries(value).filter(([, v]) => v != null)) as Record<string, number>;
    return Object.keys(kept).length > 0 ? kept : null;
  });

// One prescribed set. Which of reps / duration / distance / calories / extra
// it carries depends on the exercise's measurement_type; the refine mirrors
// the DB's program_item_sets_has_measure check (at least one measure). Weight
// may be negative: assisted bodyweight work is stored as -assistance. The
// ranges are deliberately wide enough for any unit the builder lets a coach
// type in (a type may be entered in minutes or km and is converted to seconds
// / metres before it reaches the server).
export const setInputSchema = z
  .object({
    reps: optionalCoercedNumber(z.coerce.number().int().min(1).max(500).nullable().optional()),
    duration_seconds: optionalCoercedNumber(z.coerce.number().int().min(1).max(14_400).nullable().optional()),
    distance_m: optionalCoercedNumber(z.coerce.number().min(1).max(1_000_000).nullable().optional()),
    calories: optionalCoercedNumber(z.coerce.number().int().min(1).max(10_000).nullable().optional()),
    weight: optionalCoercedNumber(z.coerce.number().min(-1000).max(1000).nullable().optional()),
    rest_seconds: optionalCoercedNumber(z.coerce.number().int().min(0).max(900).nullable().optional()),
    extra: extraSchema,
    // Targets (20261114000003): set type, upper rep bound, %1RM, RPE / RIR.
    set_type: z.enum(SET_TYPES).optional(),
    reps_max: optionalCoercedNumber(z.coerce.number().int().min(1).max(500).nullable().optional()),
    pct_1rm: optionalCoercedNumber(z.coerce.number().min(1).max(200).nullable().optional()),
    rpe_target: optionalCoercedNumber(z.coerce.number().min(1).max(10).multipleOf(0.5).nullable().optional()),
    rir_target: optionalCoercedNumber(z.coerce.number().int().min(0).max(10).nullable().optional()),
  })
  .refine(
    (v) => v.reps != null || v.duration_seconds != null || v.distance_m != null || v.calories != null || v.extra != null,
    { message: "set_needs_measure", path: ["reps"] }
  )
  .refine((v) => v.reps_max == null || v.reps == null || v.reps_max >= v.reps, {
    message: "reps_range_invalid",
    path: ["reps_max"],
  });

export const progressionRuleSchema = z.enum(["none", "plus_2_5kg_week", "plus_5kg_week", "plus_1_rep_week"]);

export const blockSchema = z.enum(["warmup", "main", "accessory", "finisher", "cooldown", "mobility", "rehab"]);

export const itemSchema = z.object({
  exercise_id: z.string().uuid(),
  sets: z.array(setInputSchema).min(1).max(20),
  progression_rule: progressionRuleSchema.default("none"),
  notes_ar: z.string().max(300).optional().or(z.literal("")),
  notes_en: z.string().max(300).optional().or(z.literal("")),
  block: blockSchema.default("main"),
  rehab_phase_id: z.string().uuid().optional().or(z.literal("")),
  coach_note_private: z.string().max(1000).optional().or(z.literal("")),
  // Per-exercise options (20261114000003). FormData sends per_side as "true".
  tempo: z.string().trim().max(12).optional().or(z.literal("")),
  per_side: z.preprocess((v) => v === true || v === "true", z.boolean()).optional(),
  scaled_notes_ar: z.string().max(300).optional().or(z.literal("")),
  scaled_notes_en: z.string().max(300).optional().or(z.literal("")),
});

export const groupKindSchema = z.enum(GROUP_KINDS);

// Format parameters of a timed group (see GroupConfig). Blank number inputs
// are dropped; an all-blank object becomes null (an untimed group).
export const groupConfigSchema = z
  .object({
    time_cap_s: optionalCoercedNumber(z.coerce.number().int().min(10).max(14_400).optional()),
    rounds: optionalCoercedNumber(z.coerce.number().int().min(1).max(100).optional()),
    interval_s: optionalCoercedNumber(z.coerce.number().int().min(5).max(3600).optional()),
    work_s: optionalCoercedNumber(z.coerce.number().int().min(1).max(3600).optional()),
    rest_s: optionalCoercedNumber(z.coerce.number().int().min(0).max(3600).optional()),
  })
  .nullable()
  .optional()
  .transform((value) => {
    if (!value) return null;
    const kept = Object.fromEntries(Object.entries(value).filter(([, v]) => v != null)) as Record<string, number>;
    return Object.keys(kept).length > 0 ? kept : null;
  });

// kind + config together so a timed kind can't be saved without the numbers
// its clock needs (amrap needs a cap, emom interval+rounds, tabata work+rounds).
export const groupFormatSchema = z
  .object({ kind: groupKindSchema, config: groupConfigSchema })
  .refine(
    ({ kind, config }) => {
      if (kind === "amrap") return !!config?.time_cap_s;
      if (kind === "emom") return !!config?.interval_s && !!config?.rounds;
      if (kind === "tabata") return !!config?.work_s && !!config?.rounds;
      return true;
    },
    { message: "group_config_incomplete", path: ["config"] }
  );

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

// Renaming only — same 100-char ceiling as the create form, trimmed so a
// whitespace-only name is rejected instead of saved as blank.
export const renameSchema = z.object({
  name_ar: z.string().trim().min(1).max(100),
  name_en: z.string().trim().min(1).max(100),
  ...planMetaShape,
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
export type RenameFormInput = z.infer<typeof renameSchema>;
export type ActivityFormInput = z.input<typeof activitySchema>;
export type ActivityInput = z.output<typeof activitySchema>;
export type RehabProtocolInput = z.infer<typeof rehabProtocolSchema>;
export type RehabPhaseFormInput = z.input<typeof rehabPhaseSchema>;
export type RehabPhaseInput = z.output<typeof rehabPhaseSchema>;
