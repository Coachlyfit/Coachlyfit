import { describe, expect, it } from "vitest";
import {
  checklist,
  countChanges,
  defaultDraft,
  flatten,
  normalizeSections,
  orderSections,
  parseDraft,
  pick,
  publishIssues,
  siteDraftSchema,
} from "./site-content";

const both = (ar: string, en: string) => ({ ar, en });

describe("siteDraftSchema", () => {
  it("accepts the default draft", () => {
    expect(siteDraftSchema.safeParse(defaultDraft()).success).toBe(true);
  });

  it("limits services to 1–4", () => {
    const d = defaultDraft();
    expect(siteDraftSchema.safeParse({ ...d, services: [] }).success).toBe(false);
    const five = Array.from({ length: 5 }, () => d.services[0]);
    expect(siteDraftSchema.safeParse({ ...d, services: five }).success).toBe(false);
    expect(siteDraftSchema.safeParse({ ...d, services: five.slice(0, 4) }).success).toBe(true);
  });

  it("requires exactly 3 how-it-works steps and at most 6 FAQ entries", () => {
    const d = defaultDraft();
    expect(siteDraftSchema.safeParse({ ...d, how: d.how.slice(0, 2) }).success).toBe(false);
    const seven = Array.from({ length: 7 }, () => ({ q: both("q", "q"), a: both("a", "a") }));
    expect(siteDraftSchema.safeParse({ ...d, faq: seven }).success).toBe(false);
  });

  it("years and clients are integers or null", () => {
    const d = defaultDraft();
    const about = (v: Partial<typeof d.about>) => siteDraftSchema.safeParse({ ...d, about: { ...d.about, ...v } }).success;
    expect(about({ years: 7, clients: 120 })).toBe(true);
    expect(about({ years: null, clients: null })).toBe(true);
    expect(about({ years: 7.5 })).toBe(false);
    expect(about({ clients: -1 })).toBe(false);
  });

  it("validates the WhatsApp number as E.164 (or empty)", () => {
    const d = defaultDraft();
    const wa = (whatsapp: string) => siteDraftSchema.safeParse({ ...d, hero: { ...d.hero, whatsapp } }).success;
    expect(wa("")).toBe(true);
    expect(wa("+201001234567")).toBe(true);
    expect(wa("01001234567")).toBe(false);
    expect(wa("+0123456789")).toBe(false);
  });

  it("limits each language's hero title and intro separately", () => {
    const d = defaultDraft();
    const hero = (v: object) => siteDraftSchema.safeParse({ ...d, hero: { ...d.hero, ...v } }).success;
    expect(hero({ title: both("x".repeat(60), "x".repeat(60)) })).toBe(true);
    expect(hero({ title: both("x".repeat(61), "") })).toBe(false);
    expect(hero({ title: both("", "x".repeat(61)) })).toBe(false);
    expect(hero({ intro: both("", "x".repeat(181)) })).toBe(false);
  });

  it("rejects non-http social links", () => {
    const d = defaultDraft();
    const social = (instagram: string) => siteDraftSchema.safeParse({ ...d, socials: { ...d.socials, instagram } }).success;
    expect(social("https://instagram.com/coach")).toBe(true);
    expect(social("javascript:alert(1)")).toBe(false);
  });

  it("rejects section lists that unpin hero or footer", () => {
    const d = defaultDraft();
    const swapped = [d.sections[1], d.sections[0], ...d.sections.slice(2)];
    expect(siteDraftSchema.safeParse({ ...d, sections: swapped }).success).toBe(false);
    const heroOff = d.sections.map((s) => (s.key === "hero" ? { ...s, enabled: false } : s));
    expect(siteDraftSchema.safeParse({ ...d, sections: heroOff }).success).toBe(false);
  });
});

describe("language", () => {
  it("pick: this language's text, else the other's, so nothing renders blank", () => {
    expect(pick(both("مرحبا", "Hello"), "en")).toBe("Hello");
    expect(pick(both("مرحبا", "Hello"), "ar")).toBe("مرحبا");
    expect(pick(both("مرحبا", ""), "en")).toBe("مرحبا");
    expect(pick(both("", "Hello"), "ar")).toBe("Hello");
    expect(pick(both("  ", ""), "en")).toBe("");
  });

  it("flatten gives each language its own text, with shared values untouched", () => {
    const d = defaultDraft();
    d.hero.title = both("كوتشي أحمد", "Coach Ahmed");
    d.about.bio = both("نبذة", "Bio");
    d.about.certs = { ar: ["إسعافات أولية"], en: ["First aid", "NASM-CPT"] };
    d.services = [{ title: both("تدريب", "Coaching"), description: both("وصف", "About it"), price: 1500, unit: "month", contactForPrice: false }];
    d.faq = [{ q: both("سؤال؟", "Question?"), a: both("جواب", "Answer") }];
    d.hero.whatsapp = "+201001234567";

    const ar = flatten(d, "ar");
    const en = flatten(d, "en");
    expect(ar.hero.title).toBe("كوتشي أحمد");
    expect(en.hero.title).toBe("Coach Ahmed");
    expect(en.about.certs).toEqual(["First aid", "NASM-CPT"]);
    expect(ar.about.certs).toEqual(["إسعافات أولية"]);
    expect(en.services[0]).toMatchObject({ title: "Coaching", price: 1500 });
    expect(ar.faq[0].q).toBe("سؤال؟");
    expect(ar.hero.whatsapp).toBe(en.hero.whatsapp);
  });

  it("flatten falls back to the other language's certs when this one has none", () => {
    const d = defaultDraft();
    d.about.certs = { ar: [], en: ["NASM-CPT"] };
    expect(flatten(d, "ar").about.certs).toEqual(["NASM-CPT"]);
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

describe("parseDraft", () => {
  it("turns an empty jsonb column into a valid default", () => {
    expect(siteDraftSchema.safeParse(parseDraft({})).success).toBe(true);
  });

  it("keeps good parts and replaces a broken one", () => {
    const c = parseDraft({ hero: { title: both("مرحبا", "Hello") }, about: { years: "seven" } });
    expect(c.hero.title).toEqual(both("مرحبا", "Hello"));
    expect(c.about.years).toBeNull();
  });

  it("migrates a site saved before it had two languages, by the script each text is written in", () => {
    const c = parseDraft({
      hero: { title: "مدرب لياقة", intro: "I help people", mainButton: "join", whatsapp: "+201001234567", secondaryLabel: "" },
      about: { photoPath: "a/b.jpg", bio: "نبذة بالعربي", certs: ["NASM-CPT", "إسعافات أولية"], years: 7, clients: null },
      services: [{ title: "Coaching", description: "وصف", price: 1500, unit: "month", contactForPrice: false }],
      how: [
        { title: "One", text: "x" },
        { title: "اتنين", text: "y" },
        { title: "Three", text: "z" },
      ],
      faq: [{ q: "كام؟", a: "Fifty" }],
      cta: { title: "Ready?", text: "", button: "" },
    });
    expect(c.hero.title).toEqual(both("مدرب لياقة", ""));
    expect(c.hero.intro).toEqual(both("", "I help people"));
    expect(c.hero.mainButton).toBe("join");
    expect(c.about.bio).toEqual(both("نبذة بالعربي", ""));
    expect(c.about.certs).toEqual({ ar: ["إسعافات أولية"], en: ["NASM-CPT"] });
    expect(c.services[0].title).toEqual(both("", "Coaching"));
    expect(c.services[0].price).toBe(1500);
    expect(c.how[1].title).toEqual(both("اتنين", ""));
    expect(c.faq[0]).toEqual({ q: both("كام؟", ""), a: both("", "Fifty") });
    expect(siteDraftSchema.safeParse(c).success).toBe(true);
  });
});

describe("theme", () => {
  it("a draft saved before colors existed gets the automatic theme", () => {
    const d = parseDraft({ hero: { title: both("مرحبا", "Hello") } });
    expect(d.theme).toEqual(defaultDraft().theme);
    expect(d.theme.mode).toBe("auto");
  });

  it("keeps the coach's picks and fills in the rest", () => {
    const d = parseDraft({ theme: { mode: "dark", dark: { background: "#101820" } } });
    expect(d.theme.mode).toBe("dark");
    expect(d.theme.dark.background).toBe("#101820");
    expect(d.theme.dark.text).toBeNull();
    expect(d.theme.light.primary).toBeNull();
  });

  it("only accepts #rrggbb colors", () => {
    const d = defaultDraft();
    const color = (v: string) => siteDraftSchema.safeParse({ ...d, theme: { ...d.theme, light: { ...d.theme.light, primary: v } } }).success;
    expect(color("#a1b2c3")).toBe(true);
    expect(color("red")).toBe(false);
    expect(color("#fff")).toBe(false);
    expect(color("#12345g")).toBe(false);
    expect(color("url(javascript:alert(1))")).toBe(false);
  });
});

describe("publish helpers", () => {
  it("blocks publishing without a named service or a WhatsApp number", () => {
    expect(publishIssues(defaultDraft())).toEqual(["services", "whatsapp"]);
    const ok = defaultDraft();
    ok.services[0].title = both("", "1:1 coaching");
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
    b.hero.title = both("جديد", "");
    b.faq = [{ q: both("q", ""), a: both("a", "") }];
    expect(countChanges(b, a)).toBe(2);
    expect(countChanges(a, null)).toBeGreaterThan(0);
  });

  it("checklist reflects real input only, in either language", () => {
    const d = defaultDraft();
    expect(checklist(d, { hasDomain: false, hasReview: false })).toEqual({ photoBio: false, services: false, domain: false, review: false });
    d.about.photoPath = "a/b.jpg";
    d.about.bio = both("نبذة", "");
    d.services = [
      { ...d.services[0], title: both("أ", "") },
      { ...d.services[0], title: both("", "B") },
    ];
    expect(checklist(d, { hasDomain: true, hasReview: true })).toEqual({ photoBio: true, services: true, domain: true, review: true });
  });
});
