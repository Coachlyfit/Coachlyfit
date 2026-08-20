import { describe, expect, it } from "vitest";
import { visibleStepFields } from "./step-derive";
import type { FormField } from "@/domain/forms/schema";

const bilingual = { ar: "س", en: "q" };

function field(overrides: Partial<FormField> & Pick<FormField, "id" | "type">): FormField {
  return { label: bilingual, required: false, ...overrides } as FormField;
}

describe("visibleStepFields", () => {
  it("drops section fields from the step list", () => {
    const fields = [field({ id: "s1", type: "section" }), field({ id: "q1", type: "text" })];
    expect(visibleStepFields(fields, {}).map((f) => f.id)).toEqual(["q1"]);
  });

  it("excludes a field hidden by visibleIf", () => {
    const fields = [
      field({ id: "q1", type: "radio", options: [{ value: "yes", label: bilingual }] }),
      field({
        id: "q2",
        type: "text",
        visibleIf: { fieldId: "q1", op: "eq", value: "yes" },
      }),
    ];
    expect(visibleStepFields(fields, { q1: "no" }).map((f) => f.id)).toEqual(["q1"]);
    expect(visibleStepFields(fields, { q1: "yes" }).map((f) => f.id)).toEqual(["q1", "q2"]);
  });

  it("recomputes the step count as answers change, without mutating input order", () => {
    const fields = [
      field({ id: "q1", type: "number" }),
      field({ id: "q2", type: "number", visibleIf: { fieldId: "q1", op: "gt", value: 5 } }),
      field({ id: "q3", type: "number" }),
    ];
    expect(visibleStepFields(fields, { q1: 3 }).map((f) => f.id)).toEqual(["q1", "q3"]);
    expect(visibleStepFields(fields, { q1: 10 }).map((f) => f.id)).toEqual(["q1", "q2", "q3"]);
  });
});
