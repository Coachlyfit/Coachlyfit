import { describe, expect, it } from "vitest";
import type { FormField } from "./schema";
import { findPublishIssue } from "./publish-check";

const field = (id: string, patch: Partial<FormField> = {}): FormField => ({
  id,
  type: "text",
  label: { ar: "سؤال", en: "" },
  required: false,
  ...patch,
});

describe("findPublishIssue", () => {
  it("rejects a form with no questions, sections don't count", () => {
    expect(findPublishIssue([])).toEqual({ code: "empty" });
    expect(findPublishIssue([field("s", { type: "section" })])).toEqual({ code: "empty" });
  });

  it("points at the first question whose label is blank in both languages", () => {
    const fields = [field("a"), field("b", { label: { ar: "  ", en: "" } })];
    expect(findPublishIssue(fields)).toEqual({ code: "label", fieldId: "b" });
  });

  it("accepts a label written in only one language", () => {
    expect(findPublishIssue([field("a", { label: { ar: "", en: "Question" } })])).toBeNull();
  });

  it("points at a choice question with an unlabeled option", () => {
    const options = [
      { value: "1", label: { ar: "أيوه", en: "" } },
      { value: "2", label: { ar: "", en: "" } },
    ];
    expect(findPublishIssue([field("a", { type: "radio", options })])).toEqual({ code: "options", fieldId: "a" });
  });
});
