import { describe, expect, it } from "vitest";
import { SLUG_PATTERN } from "./portal-slug";

describe("SLUG_PATTERN", () => {
  it("accepts lowercase letters, digits and internal hyphens up to 40 chars", () => {
    for (const slug of ["moathfit-online", "coach1", "a1b", "a".repeat(40)]) {
      expect(SLUG_PATTERN.test(slug), slug).toBe(true);
    }
  });

  it("rejects uppercase, spaces, edge hyphens, dots and over-long slugs", () => {
    for (const slug of ["", "Moath", "my fit", "-fit", "fit-", "my.fit", "مدرب", "a".repeat(41)]) {
      expect(SLUG_PATTERN.test(slug), slug).toBe(false);
    }
  });
});
