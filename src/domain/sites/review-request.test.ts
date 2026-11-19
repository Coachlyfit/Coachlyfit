import { describe, expect, it } from "vitest";
import { parseReviewRequest, parseSubmitOutcome } from "./review-request";

describe("parseReviewRequest", () => {
  it("reads an open link with its card preview", () => {
    const v = parseReviewRequest({
      state: "open",
      expires_at: "2026-12-03T00:00:00Z",
      first_name: "Sara",
      preview: { before: "https://x/b", after: "https://x/a" },
      coach: { business_name: "Coach Ahmed", slug: "ahmed", logo_path: null, brand_primary: "#111111", brand_accent: null },
    });
    expect(v).toMatchObject({ state: "open", firstName: "Sara", coach: { name: "Coach Ahmed", primary: "#111111" } });
    expect(v.preview).toEqual({ before: "https://x/b", after: "https://x/a" });
  });

  it("keeps used and expired distinct from invalid", () => {
    expect(parseReviewRequest({ state: "used", coach: {} }).state).toBe("used");
    expect(parseReviewRequest({ state: "expired", coach: {} }).state).toBe("expired");
  });

  it("treats anything unexpected as invalid", () => {
    for (const bad of [null, undefined, "x", [], {}, { state: "weird" }, { state: 5 }]) {
      expect(parseReviewRequest(bad).state).toBe("invalid");
    }
  });
});

describe("parseSubmitOutcome", () => {
  it("success carries the display name and consent", () => {
    expect(parseSubmitOutcome({ ok: true, display_name: "Sara M.", share_photos: true })).toEqual({ ok: true, displayName: "Sara M.", sharePhotos: true });
  });

  it("known failures pass through; everything else is generic", () => {
    expect(parseSubmitOutcome({ ok: false, error: "rate_limited" })).toEqual({ ok: false, error: "rate_limited" });
    expect(parseSubmitOutcome({ ok: false, error: "invalid_link" })).toEqual({ ok: false, error: "invalid_link" });
    expect(parseSubmitOutcome({ ok: false, error: "secret db detail" })).toEqual({ ok: false, error: "failed" });
    expect(parseSubmitOutcome(null)).toEqual({ ok: false, error: "failed" });
  });
});
