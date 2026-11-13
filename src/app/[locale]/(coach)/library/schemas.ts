import { z } from "zod";
import { MUSCLE_GROUPS, FOOD_CATEGORIES } from "@/domain/library/taxonomy";
import { MEASUREMENT_TYPES } from "@/domain/library/measurement";
import { SKILL_GROUPS } from "@/domain/progress/skill-levels";

export const createExerciseSchema = z.object({
  name_ar: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
  muscle_group: z.enum(MUSCLE_GROUPS).optional(),
  // How the exercise is measured (weight × reps, a timed hold, a distance...)
  // — decides the inputs the builder/runner show. Omitted = unchanged on edit,
  // the column default (weight_reps) on create.
  measurement_type: z.enum(MEASUREMENT_TYPES).optional(),
  equipment: z.string().max(50).optional(),
  video_url: z.string().url().optional().or(z.literal("")),
  image_url: z.string().url().optional().or(z.literal("")),
  instructions_ar: z.string().max(2000).optional(),
  instructions_en: z.string().max(2000).optional(),
  // One cue per line — split into exercises.cues_ar/cues_en at the action
  // boundary, not validated as an array here since the field is a plain
  // textarea.
  cues_ar: z.string().max(1000).optional(),
  cues_en: z.string().max(1000).optional(),
  coach_notes_ar: z.string().max(2000).optional(),
  coach_notes_en: z.string().max(2000).optional(),
  // One step/mistake/muscle per line, same convention as cues_ar/cues_en —
  // split into text[] at the action boundary via lines-to-array.ts.
  steps_ar: z.string().max(2000).optional(),
  steps_en: z.string().max(2000).optional(),
  mistakes_ar: z.string().max(1000).optional(),
  mistakes_en: z.string().max(1000).optional(),
  safety_ar: z.string().max(1000).optional(),
  safety_en: z.string().max(1000).optional(),
  tempo: z.string().max(20).optional(),
  primary_muscles: z.string().max(500).optional(),
  secondary_muscles: z.string().max(500).optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  // Optional rung of a calisthenics skill ladder (planche, front lever, ...).
  // The two go together — the DB requires both or neither, and the actions check
  // that (a refine here would turn this object into an effect and break callers
  // that extend or partial it). "" is the form's "not set".
  skill_group: z.enum(SKILL_GROUPS).optional().or(z.literal("")),
  // A real number (no z.coerce): the form converts the input's text with
  // setValueAs and the action converts the FormData string, so this schema's
  // input and output types stay the same and it still works as the RHF form type.
  skill_level: z.number().int().min(1).max(10).optional(),
  thumbnail_url: z.string().url().optional().or(z.literal("")),
  video_url_alt: z.string().url().optional().or(z.literal("")),
  // Only ever set by the clone flow (prefilled, not user-typed) and stripped
  // again by LibraryService.updateExercise on every edit — validated here
  // only so a forged non-uuid string fails fast instead of hitting the DB.
  source_exercise_id: z.string().uuid().optional(),
});

export const createFoodSchema = z.object({
  name_ar: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
  serving_label: z.string().min(1).max(50),
  category: z.enum(FOOD_CATEGORIES),
  kcal: z.coerce.number().min(0),
  protein_g: z.coerce.number().min(0),
  carb_g: z.coerce.number().min(0),
  fat_g: z.coerce.number().min(0),
  notes_ar: z.string().max(2000).optional(),
  notes_en: z.string().max(2000).optional(),
  // Same rule as createExerciseSchema.source_exercise_id.
  source_food_id: z.string().uuid().optional(),
});

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

// z.coerce.number() fields make the schema's input type (what RHF's number
// inputs actually hand it, pre-validation) diverge from its output type
// (what the resolver produces post-validation) — z.input/z.output split
// keeps both sides honest instead of forcing one shape on the other.
export type CreateFoodFormInput = z.input<typeof createFoodSchema>;
export type CreateFoodInput = z.output<typeof createFoodSchema>;
