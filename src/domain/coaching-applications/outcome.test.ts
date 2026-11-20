import { describe, expect, it } from "vitest";
import { parseSubmitOutcome } from "./outcome";

describe("parseSubmitOutcome", () => {
  it("parses success", () => {
    expect(parseSubmitOutcome({ ok: true, id: "a", coach_id: "b" })).toEqual({ ok: true, id: "a", coachId: "b" });
  });
  it("passes known errors through", () => {
    expect(parseSubmitOutcome({ ok: false, error: "rate_limited" })).toEqual({ ok: false, error: "rate_limited" });
    expect(parseSubmitOutcome({ ok: false, error: "not_found" })).toEqual({ ok: false, error: "not_found" });
  });
  it("degrades to failed on anything else", () => {
    for (const bad of [null, "x", [], {}, { ok: true }, { ok: false, error: "boom" }]) {
      expect(parseSubmitOutcome(bad)).toEqual({ ok: false, error: "failed" });
    }
  });
});
