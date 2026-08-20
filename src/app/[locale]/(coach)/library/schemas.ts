import { z } from "zod";
import { MUSCLE_GROUPS, FOOD_CATEGORIES } from "@/domain/library/taxonomy";

export const createExerciseSchema = z.object({
  name_ar: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
  muscle_group: z.enum(MUSCLE_GROUPS).optional(),
  equipment: z.string().max(50).optional(),
  video_url: z.string().url().optional().or(z.literal("")),
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
});

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

// z.coerce.number() fields make the schema's input type (what RHF's number
// inputs actually hand it, pre-validation) diverge from its output type
// (what the resolver produces post-validation) — z.input/z.output split
// keeps both sides honest instead of forcing one shape on the other.
export type CreateFoodFormInput = z.input<typeof createFoodSchema>;
export type CreateFoodInput = z.output<typeof createFoodSchema>;
