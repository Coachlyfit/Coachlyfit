import { describe, expect, it } from "vitest";
import { buildAnswerSchema, isEmptyAnswer, sanitizeDraftAnswers } from "./derive";
import type { FormField } from "./schema";

function field(overrides: Partial<FormField>): FormField {
  return {
    id: "f1",
    type: "text",
    label: { ar: "حقل", en: "Field" },
    required: false,
    ...overrides,
  } as FormField;
}

describe("buildAnswerSchema", () => {
  it("requires a required field that's present", () => {
    const schema = buildAnswerSchema({ fields: [field({ id: "name", required: true })] });
    expect(schema.safeParse({ name: "Ahmed" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ name: "" }).success).toBe(false);
  });

  it("skips section fields entirely — no answer expected, no validation", () => {
    const schema = buildAnswerSchema({
      fields: [field({ id: "heading", type: "section", required: true })],
    });
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("does not require a field hidden by visibleIf, even if marked required", () => {
    const schema = buildAnswerSchema({
      fields: [
        field({ id: "hasInjury", type: "checkbox" }),
        field({
          id: "injuryDetail",
          required: true,
          visibleIf: { fieldId: "hasInjury", op: "eq", value: true },
        }),
      ],
    });
    // hasInjury is false/absent -> injuryDetail is hidden -> not required.
    expect(schema.safeParse({ hasInjury: false }).success).toBe(true);
    // hasInjury is true -> injuryDetail becomes visible and required.
    expect(schema.safeParse({ hasInjury: true }).success).toBe(false);
    expect(schema.safeParse({ hasInjury: true, injuryDetail: "knee" }).success).toBe(true);
  });

  it("coerces number and scale answers from string form input", () => {
    const schema = buildAnswerSchema({
      fields: [
        field({ id: "reps", type: "number" }),
        field({ id: "energy", type: "scale", min: 1, max: 5 }),
      ],
    });
    const result = schema.safeParse({ reps: "12", energy: "4" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reps).toBe(12);
      expect(result.data.energy).toBe(4);
    }
  });

  it("rejects a select answer that isn't one of the field's options", () => {
    const schema = buildAnswerSchema({
      fields: [
        field({
          id: "goal",
          type: "select",
          options: [
            { value: "bulk", label: { ar: "تضخيم", en: "Bulk" } },
            { value: "cut", label: { ar: "تنشيف", en: "Cut" } },
          ],
        }),
      ],
    });
    expect(schema.safeParse({ goal: "bulk" }).success).toBe(true);
    expect(schema.safeParse({ goal: "not-an-option" }).success).toBe(false);
  });

  it("accepts a multiselect array and an exercise_ref uuid", () => {
    const schema = buildAnswerSchema({
      fields: [
        field({ id: "days", type: "multiselect" }),
        field({ id: "exercise", type: "exercise_ref" }),
      ],
    });
    expect(
      schema.safeParse({
        days: ["mon", "wed"],
        exercise: "123e4567-e89b-12d3-a456-426614174000",
      }).success
    ).toBe(true);
    expect(schema.safeParse({ exercise: "not-a-uuid" }).success).toBe(false);
  });
});

describe("isEmptyAnswer", () => {
  it("treats undefined, null, empty string and empty array as empty, but not 0 or false", () => {
    for (const v of [undefined, null, "", []]) expect(isEmptyAnswer(v)).toBe(true);
    for (const v of [0, false, "0", ["a"]]) expect(isEmptyAnswer(v)).toBe(false);
  });
});

describe("sanitizeDraftAnswers", () => {
  const fields = [
    field({ id: "weight", type: "number" }),
    field({ id: "mood", type: "radio", options: [{ value: "good", label: { ar: "جيد", en: "Good" } }] }),
    field({ id: "notes", type: "textarea" }),
    field({ id: "head", type: "section" }),
  ];

  it("keeps valid partial answers and drops empty, invalid, unknown and section entries", () => {
    expect(
      sanitizeDraftAnswers(fields, { weight: "78.5", mood: "nope", notes: "", head: "x", ghost: 1 })
    ).toEqual({ weight: 78.5 });
  });

  it("keeps a legitimate zero and false-y-but-answered values", () => {
    expect(sanitizeDraftAnswers(fields, { weight: 0, mood: "good" })).toEqual({ weight: 0, mood: "good" });
  });
});
