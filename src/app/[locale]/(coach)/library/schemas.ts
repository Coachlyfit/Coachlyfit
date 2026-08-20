import { z } from "zod";
import { MUSCLE_GROUPS, FOOD_CATEGORIES } from "@/domain/library/taxonomy";

export const createExerciseSchema = z.object({
  name_ar: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
  muscle_group: z.enum(MUSCLE_GROUPS).optional(),
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
