import { describe, expect, it } from "vitest";
import { formFieldSchema, formTemplateSchema } from "./schema";

describe("formFieldSchema", () => {
  it("accepts a plain text field with no options", () => {
    const result = formFieldSchema.safeParse({
      id: "name",
      type: "text",
      label: { ar: "الاسم", en: "Name" },
      required: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a select field with no options", () => {
    const result = formFieldSchema.safeParse({
      id: "goal",
      type: "select",
      label: { ar: "الهدف", en: "Goal" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a select field with at least one option", () => {
    const result = formFieldSchema.safeParse({
      id: "goal",
      type: "select",
      label: { ar: "الهدف", en: "Goal" },
      options: [{ value: "bulk", label: { ar: "تضخيم", en: "Bulk" } }],
    });
    expect(result.success).toBe(true);
  });
});

describe("formTemplateSchema", () => {
  it("accepts a template with a mixed field list", () => {
    const result = formTemplateSchema.safeParse({
      version: 1,
      fields: [
        { id: "s1", type: "section", label: { ar: "القسم الأول", en: "Section 1" } },
        { id: "name", type: "text", label: { ar: "الاسم", en: "Name" }, required: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown field type", () => {
    const result = formTemplateSchema.safeParse({
      version: 1,
      fields: [{ id: "x", type: "not-a-real-type", label: { ar: "س", en: "X" } }],
    });
    expect(result.success).toBe(false);
  });
});
