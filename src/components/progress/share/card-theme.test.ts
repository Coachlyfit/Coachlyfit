import { describe, expect, it } from "vitest";
import { cardVars, coachThemeUsable } from "./card-theme";

describe("cardVars", () => {
  it("light uses the Tokens-board values", () => {
    const v = cardVars("light", { primary: null, accent: null });
    expect(v["--card-bg"]).toBe("#F8FAFC");
    expect(v["--card-primary"]).toBe("#C2410C");
    expect(v["--card-accent"]).toBe("#EA580C");
    expect(v["--card-tint"]).toBe("#FFEDD5");
  });

  it("dark flips the grounds and keeps the brand orange", () => {
    const v = cardVars("dark", { primary: null, accent: null });
    expect(v["--card-bg"]).toBe("#020617");
    expect(v["--card-ink"]).toBe("#E2E8F0");
    expect(v["--card-primary"]).toBe("#C2410C");
  });

  it("coach derives bg/line/tint from the coach colors and keeps ink fixed", () => {
    const v = cardVars("coach", { primary: "#0F766E", accent: "#0D9488" });
    expect(v["--card-primary"]).toBe("#0f766e");
    expect(v["--card-accent"]).toBe("#0d9488");
    // 94% toward white, per the board's formula (its #F3F8F8 swatch is only an example).
    expect(v["--card-bg"]).toBe("#f1f7f6");
    expect(v["--card-ink"]).toBe("#0F172A");
    expect(v["--card-mark-dot"]).toBe("#C2410C");
  });

  it("coach falls back to light when the primary is unreadable under white text", () => {
    const v = cardVars("coach", { primary: "#fde047", accent: null });
    expect(v["--card-primary"]).toBe("#C2410C");
  });
});

describe("coachThemeUsable", () => {
  it("accepts AA primaries and rejects light or missing ones", () => {
    expect(coachThemeUsable({ primary: "#0F766E", accent: null })).toBe(true);
    expect(coachThemeUsable({ primary: "#fde047", accent: null })).toBe(false);
    expect(coachThemeUsable({ primary: null, accent: "#0D9488" })).toBe(false);
  });
});
