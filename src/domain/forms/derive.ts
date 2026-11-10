import { z } from "zod";
import type { FormField, FormTemplateSchema, VisibleIf } from "./schema";

export function isEmptyAnswer(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function compare(op: VisibleIf["op"], actual: unknown, expected: unknown): boolean {
  switch (op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
  }
}

// Exported so the renderer (deciding what to show) and this module
// (deciding what to require) never drift apart into two definitions of
// "visible".
export function isFieldVisible(field: FormField, answers: Record<string, unknown>): boolean {
  if (!field.visibleIf) return true;
  return compare(field.visibleIf.op, answers[field.visibleIf.fieldId], field.visibleIf.value);
}

// One Zod shape per field type, always optional at this layer — `required`
// is enforced in the superRefine below instead, because a required field
// hidden by visibleIf must NOT block submission. Section fields carry no
// answer at all.
export function fieldAnswerShape(field: FormField): z.ZodTypeAny {
  switch (field.type) {
    case "section":
      return z.undefined();
    case "number":
    case "scale":
      return z.coerce.number().optional();
    case "checkbox":
      return z.boolean().optional();
    case "multiselect":
      return z.array(z.string()).optional();
    case "select":
    case "radio": {
      const values = (field.options ?? []).map((o) => o.value);
      return z
        .string()
        .refine((v) => values.includes(v), { message: "Not one of the field's options" })
        .optional();
    }
    case "exercise_ref":
    case "food_ref":
      return z.string().uuid().optional();
    default:
      // text, textarea, date, photo, file — plain string payload.
      return z.string().optional();
  }
}

/** Derives a per-submission Zod validator from a template's field list.
 * Feeds three consumers with one function: the client fill form's RHF
 * resolver, the server's pre-insert check, and the coach's preview — so a
 * field type only has to be taught how to validate itself once. */
export function buildAnswerSchema(template: Pick<FormTemplateSchema, "fields">) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of template.fields) {
    if (field.type === "section") continue;
    shape[field.id] = fieldAnswerShape(field);
  }

  return z.object(shape).superRefine((answers, ctx) => {
    for (const field of template.fields) {
      if (field.type === "section" || !field.required) continue;
      if (!isFieldVisible(field, answers)) continue;
      if (isEmptyAnswer(answers[field.id])) {
        ctx.addIssue({ code: "custom", message: "Required", path: [field.id] });
      }
    }
  });
}

/** Draft answers are partial and untrusted: keep only the entries that are
 * non-empty and valid for their field, drop the rest (unknown ids, wrong
 * types, bad option values) instead of rejecting the whole draft — one bad
 * value must not stop every later autosave. Required-ness is not checked;
 * that is submit's job (buildAnswerSchema). */
export function sanitizeDraftAnswers(
  fields: FormField[],
  answers: Record<string, unknown>
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === "section") continue;
    const value = answers[field.id];
    if (isEmptyAnswer(value)) continue;
    const parsed = fieldAnswerShape(field).safeParse(value);
    if (parsed.success && parsed.data !== undefined) clean[field.id] = parsed.data;
  }
  return clean;
}
