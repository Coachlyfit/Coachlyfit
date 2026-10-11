import { describe, expect, it } from "vitest";
import { brandCss, brandTokens, contrast, normalizeHex } from "./brand-theme";

describe("normalizeHex", () => {
  it("accepts 6-digit hex with or without #, lowercased", () => {
    expect(normalizeHex("#C2410C")).toBe("#c2410c");
    expect(normalizeHex("c2410c")).toBe("#c2410c");
  });
  it("rejects anything else", () => {
    expect(normalizeHex("#fff")).toBeNull();
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("#c2410c;}body{")).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });
});

describe("brandTokens", () => {
  const swatches = ["#facc15", "#22d3ee", "#c2410c", "#7c3aed", "#ffffff", "#000000", "#16a34a"];

  it.each(swatches)("keeps every text pairing at AA for %s", (color) => {
    const { light, dark } = brandTokens({ primary: color, accent: color });
    expect(contrast(light["--primary"], light["--primary-foreground"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light["--primary"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark["--primary"], dark["--primary-foreground"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark["--primary"], "#020617")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light["--accent-tint"], light["--accent-tint-foreground"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark["--accent-tint"], dark["--accent-tint-foreground"])).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves an AA-safe primary untouched in light mode", () => {
    expect(brandTokens({ primary: "#c2410c", accent: null }).light["--primary"]).toBe("#c2410c");
  });

  it("derives accent from primary when no accent is set", () => {
    const a = brandTokens({ primary: "#7c3aed", accent: null });
    const b = brandTokens({ primary: "#7c3aed", accent: "#7c3aed" });
    expect(a.light["--accent-tint"]).toBe(b.light["--accent-tint"]);
  });

  it("emits nothing when no colors are set", () => {
    expect(brandCss({ primary: null, accent: null })).toBe("");
  });
});
