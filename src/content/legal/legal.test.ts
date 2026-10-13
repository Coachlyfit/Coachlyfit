import { describe, expect, it } from "vitest";
import { LEGAL_SLUGS, LEGAL_VERSION, getLegalDoc } from "./index";

describe("legal content", () => {
  it("LEGAL_VERSION is a date the signup trigger accepts", () => {
    expect(LEGAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  for (const slug of LEGAL_SLUGS) {
    describe(slug, () => {
      const ar = getLegalDoc(slug, "ar");
      const en = getLegalDoc(slug, "en");

      it("has the same sections in both languages, in the same order", () => {
        expect(ar.sections.map((s) => s.id)).toEqual(en.sections.map((s) => s.id));
      });

      it("has no empty text", () => {
        for (const doc of [ar, en]) {
          expect(doc.title.trim()).not.toBe("");
          expect(doc.description.trim()).not.toBe("");
          expect(doc.sections.length).toBeGreaterThan(0);
          for (const s of doc.sections) {
            expect(s.heading.trim()).not.toBe("");
            expect((s.paragraphs?.length ?? 0) + (s.items?.length ?? 0)).toBeGreaterThan(0);
            for (const text of [...(s.paragraphs ?? []), ...(s.items ?? [])]) expect(text.trim()).not.toBe("");
          }
        }
      });

      it("has unique section ids", () => {
        const ids = en.sections.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
      });
    });
  }
});
