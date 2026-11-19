import { describe, expect, it } from "vitest";
import {
  checklist,
  countChanges,
  defaultDraft,
  normalizeSections,
  orderSections,
  parseContent,
  publishIssues,
  siteContentSchema,
} from "./site-content";

describe("siteContentSchema", () => {
  it("accepts the default draft", () => {
    expect(siteContentSchema.safeParse(defaultDraft()).success).toBe(true);
  });

  it("limits services to 1–4", () => {
    const d = defaultDraft();
    expect(siteContentSchema.safeParse({ ...d, services: [] }).success).toBe(false);
    const five = Array.from({ length: 5 }, () => d.services[0]);
    expect(siteContentSchema.safeParse({ ...d, services: five }).success).toBe(false);
    expect(siteContentSchema.safeParse({ ...d, services: five.slice(0, 4) }).success).toBe(true);
  });

  it("requires exactly 3 how-it-works steps and at most 6 FAQ entries", () => {
    const d = defaultDraft();
    expect(siteContentSchema.safeParse({ ...d, how: d.how.slice(0, 2) }).success).toBe(false);
    const seven = Array.from({ length: 7 }, () => ({ q: "q", a: "a" }));
    expect(siteContentSchema.safeParse({ ...d, faq: seven }).success).toBe(false);
  });

  it("years and clients are integers or null", () => {
    const d = defaultDraft();
    const about = (v: Partial<typeof d.about>) => siteContentSchema.safeParse({ ...d, about: { ...d.about, ...v } }).success;
    expect(about({ years: 7, clients: 120 })).toBe(true);
    expect(about({ years: null, clients: null })).toBe(true);
    expect(about({ years: 7.5 })).toBe(false);
    expect(about({ clients: -1 })).toBe(false);
  });

  it("validates the WhatsApp number as E.164 (or empty)", () => {
    const d = defaultDraft();
    const wa = (whatsapp: string) => siteContentSchema.safeParse({ ...d, hero: { ...d.hero, whatsapp } }).success;
    expect(wa("")).toBe(true);
    expect(wa("+201001234567")).toBe(true);
    expect(wa("01001234567")).toBe(false);
    expect(wa("+0123456789")).toBe(false);
  });

  it("enforces hero title / intro limits", () => {
    const d = defaultDraft();
    const hero = (v: object) => siteContentSchema.safeParse({ ...d, hero: { ...d.hero, ...v } }).success;
    expect(hero({ title: "x".repeat(60) })).toBe(true);
    expect(hero({ title: "x".repeat(61) })).toBe(false);
    expect(hero({ intro: "x".repeat(181) })).toBe(false);
  });

  it("rejects non-http social links", () => {
    const d = defaultDraft();
    const social = (instagram: string) => siteContentSchema.safeParse({ ...d, socials: { ...d.socials, instagram } }).success;
    expect(social("https://instagram.com/coach")).toBe(true);
    expect(social("javascript:alert(1)")).toBe(false);
  });

  it("rejects section lists that unpin hero or footer", () => {
    const d = defaultDraft();
    const swapped = [d.sections[1], d.sections[0], ...d.sections.slice(2)];
    expect(siteContentSchema.safeParse({ ...d, sections: swapped }).success).toBe(false);
    const heroOff = d.sections.map((s) => (s.key === "hero" ? { ...s, enabled: false } : s));
    expect(siteContentSchema.safeParse({ ...d, sections: heroOff }).success).toBe(false);
  });
});

describe("sections", () => {
  it("normalizes: hero first, footer last, no duplicates, missing keys added", () => {
    const out = normalizeSections([
      { key: "footer", enabled: false },
      { key: "faq", enabled: true },
      { key: "faq", enabled: false },
      { key: "bogus", enabled: true },
      { key: "about", enabled: false },
    ]);
    expect(out[0]).toEqual({ key: "hero", enabled: true });
    expect(out[out.length - 1]).toEqual({ key: "footer", enabled: true });
    expect(out.map((s) => s.key)).toHaveLength(9);
    expect(new Set(out.map((s) => s.key)).size).toBe(9);
    expect(out.find((s) => s.key === "faq")?.enabled).toBe(true);
    expect(out.find((s) => s.key === "about")?.enabled).toBe(false);
  });

  it("orderSections returns enabled keys in saved order", () => {
    const order = orderSections([
      { key: "hero", enabled: true },
      { key: "services", enabled: true },
      { key: "about", enabled: false },
      { key: "results", enabled: true },
      { key: "footer", enabled: true },
    ]);
    expect(order[0]).toBe("hero");
    expect(order[order.length - 1]).toBe("footer");
    expect(order).not.toContain("about");
    expect(order.indexOf("services")).toBeLessThan(order.indexOf("results"));
  });
});

describe("parseContent", () => {
  it("turns an empty jsonb column into a valid default", () => {
    const c = parseContent({});
    expect(siteContentSchema.safeParse(c).success).toBe(true);
  });

  it("keeps good parts and replaces a broken one", () => {
    const c = parseContent({ hero: { title: "Hello" }, about: { years: "seven" } });
    expect(c.hero.title).toBe("Hello");
    expect(c.about.years).toBeNull();
  });
});

describe("publish helpers", () => {
  it("blocks publishing without a named service or a WhatsApp number", () => {
    expect(publishIssues(defaultDraft())).toEqual(["services", "whatsapp"]);
    const ok = defaultDraft();
    ok.services[0].title = "1:1 coaching";
    ok.hero.whatsapp = "+201001234567";
    expect(publishIssues(ok)).toEqual([]);
    ok.hero.mainButton = "join";
    ok.hero.whatsapp = "";
    expect(publishIssues(ok)).toEqual([]);
  });

  it("counts changed parts", () => {
    const a = defaultDraft();
    const b = defaultDraft();
    expect(countChanges(a, b)).toBe(0);
    b.hero.title = "New";
    b.faq = [{ q: "q", a: "a" }];
    expect(countChanges(b, a)).toBe(2);
    expect(countChanges(a, null)).toBeGreaterThan(0);
  });

  it("checklist reflects real input only", () => {
    const d = defaultDraft();
    expect(checklist(d, { hasDomain: false, hasReview: false })).toEqual({ photoBio: false, services: false, domain: false, review: false });
    d.about.photoPath = "a/b.jpg";
    d.about.bio = "Hi";
    d.services = [
      { ...d.services[0], title: "A" },
      { ...d.services[0], title: "B" },
    ];
    expect(checklist(d, { hasDomain: true, hasReview: true })).toEqual({ photoBio: true, services: true, domain: true, review: true });
  });
});
