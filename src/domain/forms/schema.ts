import { z } from "zod";

// The full field-type vocabulary from the build plan. exercise_ref/food_ref
// are the differentiator — a workout/diet form field that points into the
// exercise/food library — but they only ever store an id here; nothing in
// this module talks to the library service.
export const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "select",
  "multiselect",
  "radio",
  "checkbox",
  "date",
  "scale",
  "photo",
  "file",
  "section",
  "exercise_ref",
  "food_ref",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

const bilingualText = z.object({ ar: z.string(), en: z.string() });

export const fieldOptionSchema = z.object({
  value: z.string().min(1),
  label: bilingualText,
});

// A scalar or array of scalars — everything compare() in derive.ts actually
// compares against, and (unlike z.unknown()) guaranteed JSON-serializable
// for storage in form_template_versions.schema.
const comparableValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const visibleIfSchema = z.object({
  fieldId: z.string(),
  op: z.enum(["eq", "neq", "gt", "lt", "in"]),
  value: z.union([comparableValue, z.array(comparableValue)]),
});

export const formFieldSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(FIELD_TYPES),
    label: bilingualText,
    help: bilingualText.optional(),
    required: z.boolean().default(false),
    options: z.array(fieldOptionSchema).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    unit: z.string().optional(),
    // Scale only: what the lowest / highest value means ("exhausted" … "full
    // of energy"), shown under the two ends of the scale.
    minLabel: bilingualText.optional(),
    maxLabel: bilingualText.optional(),
    visibleIf: visibleIfSchema.optional(),
  })
  .refine(
    (field) => !["select", "multiselect", "radio"].includes(field.type) || (field.options?.length ?? 0) > 0,
    { message: "Choice fields need at least one option", path: ["options"] }
  );

export type FormField = z.infer<typeof formFieldSchema>;
export type FieldOption = z.infer<typeof fieldOptionSchema>;
export type VisibleIf = z.infer<typeof visibleIfSchema>;

export const formTemplateSchema = z.object({
  version: z.literal(1),
  fields: z.array(formFieldSchema),
});

export type FormTemplateSchema = z.infer<typeof formTemplateSchema>;

export const FORM_KINDS = ["intake", "workout", "diet", "checkin", "custom"] as const;
export type FormKind = (typeof FORM_KINDS)[number];
