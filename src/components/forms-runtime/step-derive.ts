import { isFieldVisible } from "@/domain/forms/derive";
import type { FormField } from "@/domain/forms/schema";

/** The step flow's field list, recomputed against live answers on every
 * render — a field hidden by visibleIf is not a step, and section fields
 * never were one (they render as null in FieldInput too). Pulled out of
 * FillForm so step order can be unit-tested without mounting React. */
export function visibleStepFields(fields: FormField[], answers: Record<string, unknown>): FormField[] {
  return fields.filter((f) => f.type !== "section" && isFieldVisible(f, answers));
}
