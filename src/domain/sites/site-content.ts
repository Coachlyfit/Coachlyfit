// The coach website's content: ONE zod schema shared by the editor (client)
// and the save/publish actions (server). `draft` and `published_content` in
// coach_sites both have this shape.
//
// Copy the coach hasn't written stays "" here; the renderer falls back to the
// localized default from messages (site.defaults.*). Nothing in this file
// invents stats, prices or testimonials.
import { z } from "zod";

export const SECTION_KEYS = ["hero", "about", "services", "results", "reviews", "how", "faq", "cta", "footer"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** Hero and footer are always on and pinned first / last. */
export const LOCKED_SECTIONS: readonly SectionKey[] = ["hero", "footer"];

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
  title: z.string().max(MAX.serviceTitle),
  description: z.string().max(MAX.serviceDescription),
  price: z.number().min(0).max(1_000_000).nullable(),
  unit: z.enum(["month", "once"]),
  contactForPrice: z.boolean(),
});
export type SiteService = z.infer<typeof serviceSchema>;

const stepSchema = z.object({ title: z.string().max(MAX.stepTitle), text: z.string().max(MAX.stepText) });

export const siteContentSchema = z.object({
  sections: z.array(sectionSchema).refine(sectionsAreValid, { message: "sections" }),
  hero: z.object({
    title: z.string().max(MAX.heroTitle),
    intro: z.string().max(MAX.heroIntro),
    mainButton: z.enum(["whatsapp", "join"]),
    // "" until the coach adds a number.
    whatsapp: z.union([z.literal(""), z.string().regex(E164)]),
    secondaryLabel: z.string().max(MAX.button),
  }),
  about: z.object({
    photoPath: z.string().max(300).nullable(),
    bio: z.string().max(MAX.bio),
    certs: z.array(z.string().min(1).max(MAX.cert)).max(MAX.certs),
    years: z.number().int().min(0).max(80).nullable(),
    clients: z.number().int().min(0).max(1_000_000).nullable(),
  }),
  services: z.array(serviceSchema).min(1).max(MAX.services),
  how: z.array(stepSchema).length(3),
  faq: z.array(z.object({ q: z.string().max(MAX.faqQ), a: z.string().max(MAX.faqA) })).max(MAX.faq),
  cta: z.object({
    title: z.string().max(MAX.ctaTitle),
    text: z.string().max(MAX.ctaText),
    button: z.string().max(MAX.button),
  }),
  socials: z.object({ instagram: url, tiktok: url, youtube: url }),
});

export type SiteContent = z.infer<typeof siteContentSchema>;

export function emptyService(): SiteService {
  return { title: "", description: "", price: null, unit: "month", contactForPrice: false };
}

export function defaultSections(): SiteSection[] {
  return SECTION_KEYS.map((key) => ({ key, enabled: true }));
}

export function defaultDraft(): SiteContent {
  return {
    sections: defaultSections(),
    hero: { title: "", intro: "", mainButton: "whatsapp", whatsapp: "", secondaryLabel: "" },
    about: { photoPath: null, bio: "", certs: [], years: null, clients: null },
    services: [emptyService()],
    how: [
      { title: "", text: "" },
      { title: "", text: "" },
      { title: "", text: "" },
    ],
    faq: [],
    cta: { title: "", text: "", button: "" },
    socials: { instagram: "", tiktok: "", youtube: "" },
  };
}

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

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads whatever is in the jsonb column (possibly `{}`, possibly from an older
 * shape) into a valid SiteContent. Missing parts come from defaultDraft(); a
 * value that still fails validation is replaced by its default rather than
 * breaking the page. */
export function parseContent(raw: unknown): SiteContent {
  const d = defaultDraft();
  const r: Loose = isObj(raw) ? raw : {};
  const obj = (k: keyof SiteContent) => ({ ...(d[k] as object), ...(isObj(r[k]) ? (r[k] as Loose) : {}) });

  const merged = {
    sections: normalizeSections(Array.isArray(r.sections) ? (r.sections as SiteSection[]) : undefined),
    hero: obj("hero"),
    about: obj("about"),
    services: Array.isArray(r.services) && r.services.length > 0 ? r.services : d.services,
    how: Array.isArray(r.how) && r.how.length === 3 ? r.how : d.how,
    faq: Array.isArray(r.faq) ? r.faq : d.faq,
    cta: obj("cta"),
    socials: obj("socials"),
  };

  const parsed = siteContentSchema.safeParse(merged);
  if (parsed.success) return parsed.data;

  // Salvage section by section so one bad field doesn't wipe the whole site.
  const out: Loose = { ...d };
  for (const key of Object.keys(d) as (keyof SiteContent)[]) {
    const part = siteContentSchema.shape[key].safeParse(merged[key]);
    if (part.success) out[key] = part.data;
  }
  return out as SiteContent;
}

export type PublishIssue = "services" | "whatsapp";

/** What blocks publishing. Drafts save freely; publishing needs these. */
export function publishIssues(c: SiteContent): PublishIssue[] {
  const issues: PublishIssue[] = [];
  if (!c.services.some((s) => s.title.trim() !== "")) issues.push("services");
  if (c.hero.mainButton === "whatsapp" && !E164.test(c.hero.whatsapp)) issues.push("whatsapp");
  return issues;
}

export type ChecklistItem = "photoBio" | "services" | "domain" | "review";

/** "Get your site ready" for a new coach. Returns each item's done state. */
export function checklist(c: SiteContent, ctx: { hasDomain: boolean; hasReview: boolean }): Record<ChecklistItem, boolean> {
  return {
    photoBio: !!c.about.photoPath && c.about.bio.trim() !== "",
    services: c.services.filter((s) => s.title.trim() !== "").length >= 2,
    domain: ctx.hasDomain,
    review: ctx.hasReview,
  };
}

/** How many parts of the draft differ from what's live ("N unpublished
 * changes"). Counts top-level parts, not individual fields. */
export function countChanges(draft: SiteContent, published: SiteContent | null): number {
  if (!published) return Object.keys(draft).length;
  let n = 0;
  for (const key of Object.keys(draft) as (keyof SiteContent)[]) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(published[key])) n++;
  }
  return n;
}
