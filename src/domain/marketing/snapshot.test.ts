import { describe, expect, it } from "vitest";
import { snapshotSchema, type Section } from "./sections.schema";
import { buildSnapshot, findPublishIssues, missingTranslations } from "./snapshot";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function cta(n: number, over: Partial<Section> = {}): Section {
  return {
    id: id(n),
    type: "final_cta",
    position: n,
    is_visible: true,
    content_ar: { title: "عنوان", subtitle: "وصف", cta: "ابدأ" },
    content_en: { title: "Title", subtitle: "Subtitle", cta: "Start" },
    settings: { background: "navy", image_position: "side" },
    ...over,
  } as Section;
}

describe("buildSnapshot", () => {
  it("orders sections by position without touching the input", () => {
    const draft = [cta(3), cta(1), cta(2)];
    expect(buildSnapshot(draft).sections.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(draft.map((s) => s.position)).toEqual([3, 1, 2]);
  });

  it("keeps hidden sections so a restore is lossless", () => {
    const snapshot = buildSnapshot([cta(1), cta(2, { is_visible: false })]);
    expect(snapshot.sections.map((s) => s.is_visible)).toEqual([true, false]);
  });

  it("round-trips through the snapshot schema", () => {
    const snapshot = buildSnapshot([cta(2), cta(1)]);
    expect(snapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });
});

describe("missingTranslations", () => {
  it("reports a field filled in for one language only", () => {
    const section = cta(1, { content_en: { title: "Title", subtitle: "  ", cta: "Start" } } as Partial<Section>);
    expect(missingTranslations(section)).toEqual([{ path: "subtitle", locale: "en" }]);
  });

  it("ignores a field left blank in both", () => {
    const blank = { title: "T", subtitle: "", cta: "Go" };
    expect(missingTranslations({ content_ar: blank, content_en: blank })).toEqual([]);
  });

  it("reports a list item that exists in one language only", () => {
    const ar = { title: "س", items: [{ q: "س١", a: "ج١" }, { q: "س٢", a: "ج٢" }] };
    const en = { title: "Q", items: [{ q: "Q1", a: "A1" }] };
    expect(missingTranslations({ content_ar: ar, content_en: en })).toEqual([
      { path: "items.1.q", locale: "en" },
      { path: "items.1.a", locale: "en" },
    ]);
  });
});

describe("findPublishIssues", () => {
  it("passes a complete draft", () => {
    expect(findPublishIssues([cta(1), cta(2)])).toEqual([]);
  });

  it("refuses a page with nothing visible", () => {
    expect(findPublishIssues([])).toEqual([{ code: "no_visible_sections" }]);
    expect(findPublishIssues([cta(1, { is_visible: false })])).toEqual([{ code: "no_visible_sections" }]);
  });

  it("points at the section and field missing a translation", () => {
    const broken = cta(2, { content_ar: { title: "", subtitle: "وصف", cta: "ابدأ" } } as Partial<Section>);
    expect(findPublishIssues([cta(1), broken])).toEqual([
      { code: "missing_translation", sectionId: id(2), path: "title", locale: "ar" },
    ]);
  });

  it("does not check hidden sections", () => {
    const hidden = cta(2, { is_visible: false, content_ar: { title: "", subtitle: "", cta: "" } } as Partial<Section>);
    expect(findPublishIssues([cta(1), hidden])).toEqual([]);
  });

  it("flags content that doesn't match its type", () => {
    const wrong = cta(1, { content_en: { title: "only" } } as unknown as Partial<Section>);
    expect(findPublishIssues([wrong])).toEqual([{ code: "invalid_content", sectionId: id(1) }]);
  });
});
