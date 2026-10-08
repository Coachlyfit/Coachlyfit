import { describe, expect, it } from "vitest";
import { FORM_KINDS, formTemplateSchema } from "./schema";
import { FORM_STARTERS } from "./starters";

describe("FORM_STARTERS", () => {
  it.each(FORM_KINDS)("%s starter is a valid template with bilingual labels and unique ids", (kind) => {
    const { name, fields } = FORM_STARTERS[kind];
    expect(formTemplateSchema.safeParse({ version: 1, fields }).success).toBe(true);
    expect(name.ar).not.toBe("");
    expect(new Set(fields.map((f) => f.id)).size).toBe(fields.length);
    for (const field of fields) {
      expect(field.label.ar).not.toBe("");
      expect(field.label.en).not.toBe("");
      for (const o of field.options ?? []) {
        expect(o.label.ar).not.toBe("");
        expect(o.label.en).not.toBe("");
      }
    }
  });
});
