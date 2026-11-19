import { describe, expect, it } from "vitest";
import { contrast } from "@/lib/brand-theme";
import { DEFAULT_ACCENT, DEFAULT_PRIMARY, guardColors, siteStyleVars } from "./theme";

describe("guardColors", () => {
  it("leaves the Coachly defaults alone", () => {
    expect(guardColors(null, null)).toEqual({ primary: DEFAULT_PRIMARY, accent: DEFAULT_ACCENT, adjusted: false });
  });

  it("keeps a coach color that already passes", () => {
    const out = guardColors("#1d4ed8", "#2563eb");
    expect(out.primary).toBe("#1d4ed8");
    expect(out.adjusted).toBe(false);
  });

  it("darkens a primary that can't carry white button text, and flags it", () => {
    const out = guardColors("#fde047", null); // pale yellow
    expect(out.adjusted).toBe(true);
    expect(contrast(out.primary, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("lifts a near-black primary so dark mode still reads", () => {
    const out = guardColors("#050505", null);
    expect(out.adjusted).toBe(true);
    expect(out.primary).not.toBe("#050505");
  });

  it("fixes an accent too dark to show on the ink band", () => {
    const out = guardColors(null, "#0f172a");
    expect(out.adjusted).toBe(true);
    expect(contrast(out.accent, "#0f172a")).toBeGreaterThanOrEqual(3);
  });

  it("ignores invalid input", () => {
    expect(guardColors("not-a-color", "#zzz")).toEqual({ primary: DEFAULT_PRIMARY, accent: DEFAULT_ACCENT, adjusted: false });
  });

  it("exposes the two inputs the stylesheet derives from", () => {
    expect(siteStyleVars({ primary: "#111111", accent: "#222222" })).toEqual({ "--p": "#111111", "--a": "#222222" });
  });
});
