import { z } from "zod";
import { toLatinDigits } from "@/lib/format";
import { INGREDIENT_UNITS } from "./recipe-nutrition";
import { normalizeVideoUrl } from "./video-url";

// Every message is a key under `recipes.errors` in messages/{ar,en}.json,
// same convention as diets/schemas.ts. Limits mirror the CHECKs in
// 20261025000001_recipes.sql.
//
// The schema must accept its own output unchanged: the form parses on the
// client, then the server action parses that output again.

/** Arabic-Indic/Persian digits → Latin, Arabic decimal separator → ".".
 * No ",": in "1,500" it's a thousands separator, so reading it as a decimal
 * point would silently turn 1500 g into 1.5. */
function normalizeNumeric(value: unknown): unknown {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return value;
  return toLatinDigits(value).replace(/٫/g, ".").trim();
}

const blankToNull = (v: unknown) => (v === "" || v === undefined || v === null ? null : v);

const integerField = (min: number, max: number, errors: { invalid: string; range: string }) =>
  z
    .string({ error: errors.invalid })
    .regex(/^\d+$/, errors.invalid)
    .transform(Number)
    .pipe(z.number().int().min(min, errors.range).max(max, errors.range));

const optionalInteger = (min: number, max: number, errors: { invalid: string; range: string }) =>
  z.preprocess((v) => blankToNull(normalizeNumeric(v)), integerField(min, max, errors).nullable());

const name = z
  .string({ error: "name_required" })
  .trim()
  .min(1, "name_required")
  .min(2, "name_too_short")
  .max(80, "name_too_long");

export const ingredientQuantitySchema = z.preprocess(
  normalizeNumeric,
  z
    .string({ error: "quantity_required" })
    .min(1, "quantity_required")
    .regex(/^\d+(\.\d+)?$/, "quantity_invalid")
    .regex(/^\d+(\.\d{1,2})?$/, "quantity_decimals")
    .transform(Number)
    .pipe(z.number().gt(0, "quantity_positive").max(5000, "quantity_too_large"))
);

export const recipeIngredientSchema = z.object({
  food_id: z.string({ error: "ingredient_food_required" }).uuid("ingredient_food_required"),
  quantity: ingredientQuantitySchema,
  unit: z.enum(INGREDIENT_UNITS, { error: "ingredient_unit_invalid" }),
  note: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || null : blankToNull(v)),
    z.string().max(60, "ingredient_note_too_long").nullable()
  ),
});

export const recipeVideoUrlSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() || null : blankToNull(v)),
  z
    .string()
    .transform((v, ctx) => {
      const normalized = normalizeVideoUrl(v);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "video_unsupported" });
        return z.NEVER;
      }
      return normalized.url;
    })
    .nullable()
);

export const recipeSchema = z.object({
  name_ar: name,
  name_en: name,
  description: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || null : blankToNull(v)),
    z.string().max(300, "description_too_long").nullable()
  ),
  servings: z.preprocess(
    normalizeNumeric,
    integerField(1, 20, { invalid: "servings_invalid", range: "servings_range" })
  ),
  prep_minutes: optionalInteger(0, 600, { invalid: "minutes_invalid", range: "minutes_range" }),
  cook_minutes: optionalInteger(0, 600, { invalid: "minutes_invalid", range: "minutes_range" }),
  ingredients: z
    .array(recipeIngredientSchema)
    .min(1, "ingredients_required")
    .max(40, "ingredients_too_many"),
  // Objects, not strings: useFieldArray needs object rows. Each row is
  // checked where it stands (a blank row passes), and blank rows are
  // dropped only afterwards, so an error's index is the row the coach sees.
  steps: z
    .array(
      z.object({
        text: z
          .string()
          .trim()
          .refine((text) => text === "" || text.length >= 3, "step_too_short")
          .refine((text) => text.length <= 500, "step_too_long"),
      })
    )
    .transform((steps) => steps.filter((step) => step.text !== ""))
    .pipe(z.array(z.object({ text: z.string() })).max(30, "steps_too_many")),
  // Trimmed, blanks dropped, case-insensitive duplicates collapsed.
  tags: z.preprocess(
    (v) => {
      if (!Array.isArray(v)) return v;
      const seen = new Set<string>();
      return v
        .map((t: unknown) => (typeof t === "string" ? t.trim() : ""))
        .filter((t) => {
          const key = t.toLowerCase();
          if (!t || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    },
    z.array(z.string().max(24, "tag_too_long")).max(8, "tags_too_many")
  ),
  video_url: recipeVideoUrlSchema,
  image_path: z.preprocess(blankToNull, z.string().max(300).nullable()),
});

export type RecipeFormInput = z.input<typeof recipeSchema>;
export type RecipeInput = z.output<typeof recipeSchema>;
