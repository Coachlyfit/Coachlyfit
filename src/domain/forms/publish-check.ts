import type { FormField } from "./schema";

const CHOICE_TYPES = ["select", "multiselect", "radio"];
const blank = (text: { ar: string; en: string }) => !text.ar.trim() && !text.en.trim();

export type PublishIssue = { code: "empty" } | { code: "label" | "options"; fieldId: string };

/** What stops a form from being published, first problem only. Stricter than
 * formTemplateSchema on purpose: a draft may hold a half-written question,
 * a published form a client fills in may not. One language is enough for a
 * label -- the renderers fall back to whichever is filled. */
export function findPublishIssue(fields: FormField[]): PublishIssue | null {
  // A section is a heading, not a question.
  if (!fields.some((f) => f.type !== "section")) return { code: "empty" };
  for (const field of fields) {
    if (blank(field.label)) return { code: "label", fieldId: field.id };
    if (CHOICE_TYPES.includes(field.type) && (field.options ?? []).some((o) => blank(o.label))) {
      return { code: "options", fieldId: field.id };
    }
  }
  return null;
}
