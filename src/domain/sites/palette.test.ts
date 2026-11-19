import { describe, expect, it } from "vitest";
import { contrast } from "@/lib/brand-theme";
import { defaultTheme, emptyPalette, isCustomized, resolveTokens, themeCss } from "./palette";

const base = { p: "#c2410c", a: "#ea580c" };

describe("themeCss", () => {
  it("emits nothing when the coach picked nothing, so site.css's own look applies", () => {
    expect(themeCss(defaultTheme(), base)).toBe("");
    expect(isCustomized(emptyPalette())).toBe(false);
  });

  it("emits only the scheme that was customized", () => {
    const theme = defaultTheme();
    theme.dark.background = "#101820";
    const css = themeCss(theme, base);
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain('[data-scheme=dark]');
    expect(css).not.toContain("prefers-color-scheme: light");
    expect(css).toContain("--bg:#101820");
  });

  it("scopes light overrides so they can't leak into a dark system", () => {
    const theme = defaultTheme();
    theme.light.card = "#ffffee";
    const css = themeCss(theme, base);
    expect(css).toContain("@media (prefers-color-scheme: light)");
    expect(css).toContain('.cs-root.cs-themed[data-scheme=light]');
  });

  it("contains no quote, angle bracket or ampersand, so React renders it unescaped", () => {
    const theme = defaultTheme();
    theme.light.primary = "#123456";
    theme.dark.card = "#222222";
    expect(themeCss(theme, base)).not.toMatch(/["'<>&]/);
  });

  it("only ever outputs hex / rgba values", () => {
    const theme = defaultTheme();
    theme.light = { primary: "#123456", accent: "#654321", background: "#ffffff", text: "#000000", card: "#eeeeee", band: "#111111", cta: "#abcdef" };
    const values = themeCss(theme, base).match(/--[a-z]+:[^;}]+/g) ?? [];
    expect(values.length).toBeGreaterThan(20);
    for (const v of values) expect(v.split(":")[1]).toMatch(/^(#[0-9a-f]{6}|rgba\([\d., ]+\))$/);
  });
});

describe("resolveTokens: contrast guard", () => {
  it("leaves a readable pick alone", () => {
    const r = resolveTokens("light", base, { ...emptyPalette(), background: "#ffffff", text: "#111111" });
    expect(r.tokens["--fg"]).toBe("#111111");
    expect(r.adjusted).toBe(false);
  });

  it("fixes text that can't be read on the page or cards, and says so", () => {
    const r = resolveTokens("light", base, { ...emptyPalette(), background: "#ffffff", text: "#dddddd" });
    expect(r.adjusted).toBe(true);
    expect(contrast(r.tokens["--fg"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps muted text and text on the band readable", () => {
    const r = resolveTokens("dark", base, { ...emptyPalette(), background: "#1b2a41", card: "#223350", band: "#f2e9d8" });
    expect(contrast(r.tokens["--muted"], r.tokens["--bg"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.tokens["--muted"], r.tokens["--card"])).toBeGreaterThanOrEqual(4.5);
    // A pale band flips its text to dark.
    expect(contrast(r.tokens["--inkfg"], r.tokens["--ink"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.tokens["--inkmuted"], r.tokens["--ink"])).toBeGreaterThanOrEqual(4.5);
  });

  it("button and CTA text always clear 4.5:1 on their fill", () => {
    for (const color of ["#fde047", "#1e3a8a", "#808080", "#000000", "#ffffff"]) {
      const r = resolveTokens("light", base, { ...emptyPalette(), primary: color, cta: color });
      expect(contrast(r.tokens["--pfill"], r.tokens["--pfg"])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(r.tokens["--cta"], r.tokens["--ctafg"])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(r.tokens["--inkbtn"], r.tokens["--inkbtnfg"])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the primary used as text reads on the page, cards and its own tint", () => {
    const r = resolveTokens("light", base, { ...emptyPalette(), primary: "#ffd54a", background: "#fff8e1" });
    for (const against of ["--bg", "--card", "--tint"]) {
      expect(contrast(r.tokens["--ptext"], r.tokens[against]), against).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the accent stays visible against the band", () => {
    const r = resolveTokens("light", base, { ...emptyPalette(), band: "#0b1020", accent: "#0b1020" });
    expect(contrast(r.tokens["--acc"], r.tokens["--ink"])).toBeGreaterThanOrEqual(3);
    expect(r.adjusted).toBe(true);
  });

  it("with no picks it reproduces the stock look (brand primary as the fill in light)", () => {
    const r = resolveTokens("light", base, emptyPalette());
    expect(r.tokens["--pfill"]).toBe(base.p);
    expect(r.tokens["--bg"]).toBe("#f8fafc");
    expect(r.adjusted).toBe(false);
  });
});

describe("headings and footer", () => {
  it("automatic: headings match the text and the footer matches the page", () => {
    const r = resolveTokens("light", base, emptyPalette());
    expect(r.tokens["--heading"]).toBe(r.tokens["--fg"]);
    expect(r.tokens["--footer"]).toBe(r.tokens["--bg"]);
  });

  it("a heading color is kept when readable, nudged when not", () => {
    const ok = resolveTokens("light", base, { ...emptyPalette(), background: "#ffffff", heading: "#7a1f2b" });
    expect(ok.tokens["--heading"]).toBe("#7a1f2b");
    expect(ok.adjusted).toBe(false);
    const bad = resolveTokens("light", base, { ...emptyPalette(), background: "#ffffff", heading: "#eeeeee" });
    expect(bad.adjusted).toBe(true);
    expect(contrast(bad.tokens["--heading"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("footer text always reads on whatever footer color is picked", () => {
    for (const footer of ["#0b1020", "#f5e9d0", "#808080", "#ffffff", "#000000"]) {
      const r = resolveTokens("light", base, { ...emptyPalette(), footer });
      expect(r.tokens["--footer"]).toBe(footer);
      expect(contrast(r.tokens["--footerfg"], footer), footer).toBeGreaterThanOrEqual(4.5);
      expect(contrast(r.tokens["--footermuted"], footer), footer).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("only an untouched palette is skipped: picking just a footer is a customization", () => {
    const theme = defaultTheme();
    theme.light.footer = "#101820";
    expect(themeCss(theme, base)).toContain("--footer:#101820");
  });
});
