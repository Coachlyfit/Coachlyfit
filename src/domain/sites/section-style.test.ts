import { describe, expect, it } from "vitest";
import { emptyStyle, isStyled, sectionCss, sectionStyleSchema, type SectionStyle } from "./section-style";
import { defaultDraft, flatten, parseDraft, siteDraftSchema } from "./site-content";

const styled = (patch: Partial<SectionStyle>): SectionStyle => ({ ...emptyStyle(), ...patch });

describe("sectionStyleSchema", () => {
  it("accepts an all-null style (everything on the site default)", () => {
    expect(sectionStyleSchema.safeParse(emptyStyle()).success).toBe(true);
  });

  it("accepts #rrggbb and #rrggbbaa colors per scheme", () => {
    const s = styled({ bg: { light: "#ffffff", dark: "#11223380" } });
    expect(sectionStyleSchema.safeParse(s).success).toBe(true);
  });

  it("rejects bad hex, uppercase, and named colors", () => {
    for (const bad of ["#fff", "#FFFFFF", "red", "#12345g", "#1234567", "url(x)"]) {
      expect(sectionStyleSchema.safeParse(styled({ text: { light: bad, dark: null } })).success, bad).toBe(false);
    }
  });

  it("enforces size ranges and whole pixels", () => {
    const ok = (p: Partial<SectionStyle>) => sectionStyleSchema.safeParse(styled(p)).success;
    expect(ok({ headingSize: 16 })).toBe(true);
    expect(ok({ headingSize: 96 })).toBe(true);
    expect(ok({ headingSize: 15 })).toBe(false);
    expect(ok({ headingSize: 97 })).toBe(false);
    expect(ok({ bodySize: 11 })).toBe(false);
    expect(ok({ bodySize: 24 })).toBe(true);
    expect(ok({ paddingTop: 0, paddingBottom: 160 })).toBe(true);
    expect(ok({ paddingTop: -1 })).toBe(false);
    expect(ok({ paddingBottom: 161 })).toBe(false);
    expect(ok({ bodySize: 14.5 })).toBe(false);
  });
});

describe("draft styles", () => {
  it("defaults to none, and an old draft without styles still parses", () => {
    expect(defaultDraft().styles).toEqual({});
    const old: Record<string, unknown> = { ...defaultDraft() };
    delete old.styles;
    expect(parseDraft(old).styles).toEqual({});
    expect(flatten(parseDraft(old), "en").styles).toEqual({});
  });

  it("is accepted by the save action's schema", () => {
    const d = { ...defaultDraft(), styles: { hero: styled({ headingSize: 40 }) } };
    expect(siteDraftSchema.safeParse(d).success).toBe(true);
  });

  it("rejects an unknown section key or a bad value", () => {
    const base = defaultDraft();
    expect(siteDraftSchema.safeParse({ ...base, styles: { nope: emptyStyle() } }).success).toBe(false);
    expect(siteDraftSchema.safeParse({ ...base, styles: { hero: styled({ bodySize: 99 }) } }).success).toBe(false);
  });

  it("drops one invalid section style and keeps the valid ones", () => {
    const raw = {
      ...defaultDraft(),
      styles: { hero: styled({ headingSize: 40 }), faq: { ...emptyStyle(), bodySize: 999 }, cta: "junk" },
    };
    const out = parseDraft(raw).styles;
    expect(out.hero?.headingSize).toBe(40);
    expect(out.faq).toBeUndefined();
    expect(out.cta).toBeUndefined();
  });
});

describe("sectionCss", () => {
  it("prints nothing when nothing is set", () => {
    expect(sectionCss({})).toBe("");
    expect(sectionCss(undefined)).toBe("");
    expect(sectionCss({ hero: emptyStyle() })).toBe("");
    expect(isStyled(emptyStyle())).toBe(false);
  });

  it("prints sizes and padding without a color scheme wrapper", () => {
    const css = sectionCss({ about: styled({ headingSize: 40, bodySize: 18, paddingTop: 12, paddingBottom: 0 }) });
    expect(css).toContain("[data-slot=about]>*{padding-block-start:12px;padding-block-end:0px}");
    expect(css).toContain("[data-slot=about] :is(.cs-h1,.cs-h2){font-size:40px}");
    expect(css).toContain("[data-slot=about] p{font-size:18px}");
    expect(css).not.toContain("prefers-color-scheme");
  });

  it("scopes a light pick to light mode only, both for system and forced scheme", () => {
    const css = sectionCss({ hero: styled({ bg: { light: "#ffeedd", dark: null } }) });
    expect(css).toContain("@media (prefers-color-scheme: light){.cs-root:not([data-scheme=dark]) [data-slot=hero]>*{background:#ffeedd}}");
    expect(css).toContain(".cs-root[data-scheme=light] [data-slot=hero]>*{background:#ffeedd}");
    expect(css).not.toContain("prefers-color-scheme: dark");
    expect(css).not.toContain(".cs-root[data-scheme=dark]");
  });

  it("emits dark picks separately, and text color drives the muted tones", () => {
    const css = sectionCss({ faq: styled({ text: { light: null, dark: "#eeeeee" }, heading: { light: null, dark: "#ffffff" } }) });
    expect(css).toContain(".cs-root[data-scheme=dark] [data-slot=faq]>*{color:#eeeeee;--fg:#eeeeee;--inkfg:#eeeeee;");
    expect(css).toContain("--muted:color-mix(in srgb,#eeeeee 70%,transparent)");
    expect(css).toContain("[data-slot=faq] :is(.cs-h1,.cs-h2,h3){color:#ffffff}");
    expect(css).not.toContain("prefers-color-scheme: light");
    expect(css).not.toContain(".cs-root[data-scheme=light]");
  });

  it("skips keys that aren't plain section names", () => {
    expect(sectionCss({ "x]{}": styled({ bodySize: 14 }) })).toBe("");
  });
});
