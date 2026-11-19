// The coach website's content.
//
// Two shapes:
//  - SiteDraft: what is STORED (coach_sites.draft / published_content) and
//    edited. Every piece of text the coach writes holds BOTH languages
//    ({ ar, en }); numbers, prices, links and the photo are shared.
//  - SiteContent: what the site RENDERS for ONE language: plain strings,
//    produced by flatten(draft, lang). The site components only see this.
//
// One zod schema (siteDraftSchema) is shared by the editor (client) and the
// save action (server). Copy the coach hasn't written stays "" and the
// renderer falls back to localized defaults from messages. Nothing here
// invents stats, prices or testimonials.
import { z } from "zod";

export const SECTION_KEYS = ["hero", "about", "services", "results", "reviews", "how", "faq", "cta", "footer"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** Hero and footer are always on and pinned first / last. */
export const LOCKED_SECTIONS: readonly SectionKey[] = ["hero", "footer"];

export const LANGS = ["ar", "en"] as const;
export type Lang = (typeof LANGS)[number];
const otherLang = (lang: Lang): Lang => (lang === "ar" ? "en" : "ar");

export const MAX = {
  heroTitle: 60,
  heroIntro: 180,
  bio: 600,
  cert: 40,
  certs: 8,
  serviceTitle: 80,
  serviceDescription: 240,
  services: 4,
  stepTitle: 80,
  stepText: 200,
  faqQ: 120,
  faqA: 400,
  faq: 6,
  ctaTitle: 60,
  ctaText: 180,
  button: 40,
  url: 200,
} as const;

/** International format, e.g. +201001234567. */
export const E164 = /^\+[1-9]\d{7,14}$/;

const url = z
  .string()
  .max(MAX.url)
  .refine((v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v), { message: "url" });

/** A text in both languages, each up to `max` characters. */
const bilingual = (max: number) => z.object({ ar: z.string().max(max), en: z.string().max(max) });
export type Bilingual = { ar: string; en: string };

const sectionSchema = z.object({ key: z.enum(SECTION_KEYS), enabled: z.boolean() });

export type SiteSection = z.infer<typeof sectionSchema>;

/** Every key exactly once, hero first and on, footer last and on. */
export function sectionsAreValid(sections: SiteSection[]): boolean {
  if (sections.length !== SECTION_KEYS.length) return false;
  if (new Set(sections.map((s) => s.key)).size !== SECTION_KEYS.length) return false;
  const first = sections[0];
  const last = sections[sections.length - 1];
  return first.key === "hero" && first.enabled && last.key === "footer" && last.enabled;
}

export const serviceSchema = z.object({
  title: bilingual(MAX.serviceTitle),
  description: bilingual(MAX.serviceDescription),
  price: z.number().min(0).max(1_000_000).nullable(),
  unit: z.enum(["month", "once"]),
  contactForPrice: z.boolean(),
});
export type SiteServiceDraft = z.infer<typeof serviceSchema>;

const stepSchema = z.object({ title: bilingual(MAX.stepTitle), text: bilingual(MAX.stepText) });
const certList = z.array(z.string().min(1).max(MAX.cert)).max(MAX.certs);

export const siteDraftSchema = z.object({
  sections: z.array(sectionSchema).refine(sectionsAreValid, { message: "sections" }),
  hero: z.object({
    title: bilingual(MAX.heroTitle),
    intro: bilingual(MAX.heroIntro),
    mainButton: z.enum(["whatsapp", "join"]),
    // "" until the coach adds a number.
    whatsapp: z.union([z.literal(""), z.string().regex(E164)]),
    secondaryLabel: bilingual(MAX.button),
  }),
  about: z.object({
    photoPath: z.string().max(300).nullable(),
    bio: bilingual(MAX.bio),
    certs: z.object({ ar: certList, en: certList }),
    years: z.number().int().min(0).max(80).nullable(),
    clients: z.number().int().min(0).max(1_000_000).nullable(),
  }),
  services: z.array(serviceSchema).min(1).max(MAX.services),
  how: z.array(stepSchema).length(3),
  faq: z.array(z.object({ q: bilingual(MAX.faqQ), a: bilingual(MAX.faqA) })).max(MAX.faq),
  cta: z.object({
    title: bilingual(MAX.ctaTitle),
    text: bilingual(MAX.ctaText),
    button: bilingual(MAX.button),
  }),
  socials: z.object({ instagram: url, tiktok: url, youtube: url }),
});

export type SiteDraft = z.infer<typeof siteDraftSchema>;

/** The site in ONE language: what the components render. */
export type SiteContent = {
  sections: SiteSection[];
  hero: { title: string; intro: string; mainButton: "whatsapp" | "join"; whatsapp: string; secondaryLabel: string };
  about: { photoPath: string | null; bio: string; certs: string[]; years: number | null; clients: number | null };
  services: { title: string; description: string; price: number | null; unit: "month" | "once"; contactForPrice: boolean }[];
  how: { title: string; text: string }[];
  faq: { q: string; a: string }[];
  cta: { title: string; text: string; button: string };
  socials: { instagram: string; tiktok: string; youtube: string };
};

const blank = (): Bilingual => ({ ar: "", en: "" });

export function emptyService(): SiteServiceDraft {
  return { title: blank(), description: blank(), price: null, unit: "month", contactForPrice: false };
}

export function defaultSections(): SiteSection[] {
  return SECTION_KEYS.map((key) => ({ key, enabled: true }));
}

export function defaultDraft(): SiteDraft {
  return {
    sections: defaultSections(),
    hero: { title: blank(), intro: blank(), mainButton: "whatsapp", whatsapp: "", secondaryLabel: blank() },
    about: { photoPath: null, bio: blank(), certs: { ar: [], en: [] }, years: null, clients: null },
    services: [emptyService()],
    how: [
      { title: blank(), text: blank() },
      { title: blank(), text: blank() },
      { title: blank(), text: blank() },
    ],
    faq: [],
    cta: { title: blank(), text: blank(), button: blank() },
    socials: { instagram: "", tiktok: "", youtube: "" },
  };
}

// ---------------------------------------------------------------- language

/** This language's text; if it's empty, the other language's, so a page never
 * shows a blank where the coach wrote something in only one language. */
export function pick(text: Bilingual, lang: Lang): string {
  return text[lang].trim() !== "" ? text[lang] : text[otherLang(lang)];
}

/** Does the coach have text in at least one language? */
export const hasText = (text: Bilingual) => text.ar.trim() !== "" || text.en.trim() !== "";

/** The draft as one language's plain content, for rendering. */
export function flatten(draft: SiteDraft, lang: Lang): SiteContent {
  const certs = draft.about.certs[lang].length > 0 ? draft.about.certs[lang] : draft.about.certs[otherLang(lang)];
  return {
    sections: draft.sections,
    hero: {
      title: pick(draft.hero.title, lang),
      intro: pick(draft.hero.intro, lang),
      mainButton: draft.hero.mainButton,
      whatsapp: draft.hero.whatsapp,
      secondaryLabel: pick(draft.hero.secondaryLabel, lang),
    },
    about: { photoPath: draft.about.photoPath, bio: pick(draft.about.bio, lang), certs, years: draft.about.years, clients: draft.about.clients },
    services: draft.services.map((s) => ({
      title: pick(s.title, lang),
      description: pick(s.description, lang),
      price: s.price,
      unit: s.unit,
      contactForPrice: s.contactForPrice,
    })),
    how: draft.how.map((s) => ({ title: pick(s.title, lang), text: pick(s.text, lang) })),
    faq: draft.faq.map((f) => ({ q: pick(f.q, lang), a: pick(f.a, lang) })),
    cta: { title: pick(draft.cta.title, lang), text: pick(draft.cta.text, lang), button: pick(draft.cta.button, lang) },
    socials: draft.socials,
  };
}

// ---------------------------------------------------------------- sections

/** Repairs any section list: drops unknown/duplicate keys, adds missing ones,
 * pins hero first and footer last, forces both on. */
export function normalizeSections(input: readonly { key: string; enabled?: boolean }[] | undefined): SiteSection[] {
  const known = new Set<string>(SECTION_KEYS);
  const seen = new Set<SectionKey>();
  const middle: SiteSection[] = [];
  for (const s of input ?? []) {
    if (!known.has(s.key)) continue;
    const key = s.key as SectionKey;
    if (seen.has(key) || LOCKED_SECTIONS.includes(key)) continue;
    seen.add(key);
    middle.push({ key, enabled: s.enabled !== false });
  }
  for (const key of SECTION_KEYS) {
    if (!seen.has(key) && !LOCKED_SECTIONS.includes(key)) middle.push({ key, enabled: true });
  }
  return [{ key: "hero", enabled: true }, ...middle, { key: "footer", enabled: true }];
}

/** Section keys to render, in order: enabled ones only. */
export function orderSections(sections: readonly SiteSection[] | undefined): SectionKey[] {
  return normalizeSections(sections)
    .filter((s) => s.enabled)
    .map((s) => s.key);
}

// ----------------------------------------------------------------- parsing

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const ARABIC = /[؀-ۿ]/;
/** Text saved before the site had two languages: put it in the language it's
 * written in. */
const fromLegacy = (v: unknown): Bilingual => {
  const s = typeof v === "string" ? v : "";
  return ARABIC.test(s) ? { ar: s, en: "" } : { ar: "", en: s };
};
const isBilingual = (v: unknown) => isObj(v) && typeof v.ar === "string" && typeof v.en === "string";
/** Already bilingual: keep. Plain string: migrate. Anything else: blank. */
const asBilingual = (v: unknown): Bilingual => (isBilingual(v) ? (v as Bilingual) : fromLegacy(v));

/** Reads any stored shape (a bilingual draft, a pre-bilingual one, or `{}`)
 * into a valid SiteDraft. Missing parts come from defaultDraft(); a part that
 * still fails validation is replaced by its default rather than breaking the page. */
export function parseDraft(raw: unknown): SiteDraft {
  const d = defaultDraft();
  const r: Loose = isObj(raw) ? raw : {};
  const hero = isObj(r.hero) ? r.hero : {};
  const about = isObj(r.about) ? r.about : {};
  const cta = isObj(r.cta) ? r.cta : {};

  const legacyCerts = Array.isArray(about.certs) ? (about.certs as unknown[]) : null;
  const certs = isObj(about.certs)
    ? { ar: arr(about.certs.ar), en: arr(about.certs.en) }
    : { ar: (legacyCerts ?? []).filter((c) => typeof c === "string" && ARABIC.test(c)), en: (legacyCerts ?? []).filter((c) => typeof c === "string" && !ARABIC.test(c)) };

  const merged = {
    sections: normalizeSections(Array.isArray(r.sections) ? (r.sections as SiteSection[]) : undefined),
    hero: {
      ...d.hero,
      ...hero,
      title: asBilingual(hero.title),
      intro: asBilingual(hero.intro),
      secondaryLabel: asBilingual(hero.secondaryLabel),
    },
    about: { ...d.about, ...about, bio: asBilingual(about.bio), certs },
    services:
      arr(r.services).length > 0
        ? arr(r.services).map((s) => {
            const o = isObj(s) ? s : {};
            return { ...emptyService(), ...o, title: asBilingual(o.title), description: asBilingual(o.description) };
          })
        : d.services,
    how:
      arr(r.how).length === 3
        ? arr(r.how).map((s) => {
            const o = isObj(s) ? s : {};
            return { title: asBilingual(o.title), text: asBilingual(o.text) };
          })
        : d.how,
    faq: arr(r.faq).map((f) => {
      const o = isObj(f) ? f : {};
      return { q: asBilingual(o.q), a: asBilingual(o.a) };
    }),
    cta: { ...d.cta, ...cta, title: asBilingual(cta.title), text: asBilingual(cta.text), button: asBilingual(cta.button) },
    socials: { ...d.socials, ...(isObj(r.socials) ? r.socials : {}) },
  };

  const parsed = siteDraftSchema.safeParse(merged);
  if (parsed.success) return parsed.data;

  // Salvage section by section so one bad field doesn't wipe the whole site.
  const out: Loose = { ...d };
  for (const key of Object.keys(d) as (keyof SiteDraft)[]) {
    const part = siteDraftSchema.shape[key].safeParse(merged[key]);
    if (part.success) out[key] = part.data;
  }
  return out as SiteDraft;
}

// -------------------------------------------------------------- publishing

export type PublishIssue = "services" | "whatsapp";

/** What blocks publishing. Drafts save freely; publishing needs these. */
export function publishIssues(c: SiteDraft): PublishIssue[] {
  const issues: PublishIssue[] = [];
  if (!c.services.some((s) => hasText(s.title))) issues.push("services");
  if (c.hero.mainButton === "whatsapp" && !E164.test(c.hero.whatsapp)) issues.push("whatsapp");
  return issues;
}

export type ChecklistItem = "photoBio" | "services" | "domain" | "review";

/** "Get your site ready" for a new coach. Returns each item's done state. */
export function checklist(c: SiteDraft, ctx: { hasDomain: boolean; hasReview: boolean }): Record<ChecklistItem, boolean> {
  return {
    photoBio: !!c.about.photoPath && hasText(c.about.bio),
    services: c.services.filter((s) => hasText(s.title)).length >= 2,
    domain: ctx.hasDomain,
    review: ctx.hasReview,
  };
}

/** How many parts of the draft differ from what's live ("N unpublished
 * changes"). Counts top-level parts, not individual fields. */
export function countChanges(draft: SiteDraft, published: SiteDraft | null): number {
  if (!published) return Object.keys(draft).length;
  let n = 0;
  for (const key of Object.keys(draft) as (keyof SiteDraft)[]) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(published[key])) n++;
  }
  return n;
}
