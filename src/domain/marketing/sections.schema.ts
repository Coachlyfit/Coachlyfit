import { z } from "zod";

/** One content schema per marketing_sections.type. The same schemas validate
 * what the editor saves, what gets published and what the public page
 * renders, so a section can't reach the renderer in a shape it doesn't expect.
 *
 * Strings may be empty: a draft is saved while it's being typed. What must be
 * filled in before publishing is checked by findPublishIssues (snapshot.ts).
 *
 * Arrays of text are arrays of objects (`bullets: [{ text }]`), never bare
 * strings, so every list in the inspector is the same repeatable group. */
const text = z.string().max(1000);
const list = <T extends z.ZodType>(item: T) => z.array(item).max(12);

export const contentSchemas = {
  hero: z.object({
    badge: text,
    title: text,
    subtitle: text,
    cta: text,
    ctaSecondary: text,
    trialNote: text,
  }),
  // The dashboard mock has no editable copy; its labels stay in the message
  // files (marketing.preview). The section exists so it can be moved or hidden.
  app_preview: z.object({}),
  stats: z.object({
    items: list(z.object({ value: text, label: text })),
  }),
  pain_points: z.object({
    eyebrow: text,
    title: text,
    subtitle: text,
    cards: list(z.object({ label: text, title: text, body: text })),
  }),
  features: z.object({
    rows: list(
      z.object({
        eyebrow: text,
        title: text,
        body: text,
        bullets: list(z.object({ text })),
      })
    ),
  }),
  arabic_first: z.object({
    eyebrow: text,
    title: text,
    subtitle: text,
    cards: list(z.object({ title: text, body: text })),
  }),
  testimonials: z.object({
    title: text,
    items: list(z.object({ quote: text, initial: text, name: text, meta: text })),
  }),
  how_it_works: z.object({
    title: text,
    steps: list(z.object({ title: text, body: text })),
  }),
  pricing: z.object({
    title: text,
    subtitle: text,
    cta: text,
  }),
  faq: z.object({
    title: text,
    items: list(z.object({ q: text, a: text })),
  }),
  final_cta: z.object({
    title: text,
    subtitle: text,
    cta: text,
  }),
} as const;

export type SectionType = keyof typeof contentSchemas;
export type SectionContent<T extends SectionType = SectionType> = z.infer<(typeof contentSchemas)[T]>;

// Display order of the type picker; matches the enum in 20261019000001.
export const SECTION_TYPES = Object.keys(contentSchemas) as SectionType[];

export const BACKGROUNDS = ["navy", "white", "muted"] as const;
export const IMAGE_POSITIONS = ["side", "below"] as const;

export const settingsSchema = z.object({
  background: z.enum(BACKGROUNDS),
  image_position: z.enum(IMAGE_POSITIONS),
  // Path inside the `marketing` storage bucket. Shared by both languages.
  image_path: z.string().max(300).optional(),
});

export type SectionSettings = z.infer<typeof settingsSchema>;

const base = z.object({
  id: z.string().uuid(),
  position: z.number().int(),
  is_visible: z.boolean(),
  settings: settingsSchema,
});

const variant = <T extends SectionType>(type: T) =>
  base.extend({ type: z.literal(type), content_ar: contentSchemas[type], content_en: contentSchemas[type] });

export const sectionSchema = z.discriminatedUnion("type", [
  variant("hero"),
  variant("app_preview"),
  variant("stats"),
  variant("pain_points"),
  variant("features"),
  variant("arabic_first"),
  variant("testimonials"),
  variant("how_it_works"),
  variant("pricing"),
  variant("faq"),
  variant("final_cta"),
]);

export type Section = z.infer<typeof sectionSchema>;

export const snapshotSchema = z.object({ sections: z.array(sectionSchema) });
export type Snapshot = z.infer<typeof snapshotSchema>;

export function isSectionType(value: string): value is SectionType {
  return value in contentSchemas;
}

/** What a newly added section starts with: every field blank, and one blank
 * item in each list so the preview shows the section's shape. */
const EMPTY: { [T in SectionType]: SectionContent<T> } = {
  hero: { badge: "", title: "", subtitle: "", cta: "", ctaSecondary: "", trialNote: "" },
  app_preview: {},
  stats: { items: [{ value: "", label: "" }] },
  pain_points: { eyebrow: "", title: "", subtitle: "", cards: [{ label: "", title: "", body: "" }] },
  features: { rows: [{ eyebrow: "", title: "", body: "", bullets: [{ text: "" }] }] },
  arabic_first: { eyebrow: "", title: "", subtitle: "", cards: [{ title: "", body: "" }] },
  testimonials: { title: "", items: [{ quote: "", initial: "", name: "", meta: "" }] },
  how_it_works: { title: "", steps: [{ title: "", body: "" }] },
  pricing: { title: "", subtitle: "", cta: "" },
  faq: { title: "", items: [{ q: "", a: "" }] },
  final_cta: { title: "", subtitle: "", cta: "" },
};

export function emptyContent<T extends SectionType>(type: T): SectionContent<T> {
  return structuredClone(EMPTY[type]);
}

// The ground each section sat on before it became a setting.
export const DEFAULT_BACKGROUND: Record<SectionType, SectionSettings["background"]> = {
  hero: "white",
  app_preview: "white",
  stats: "navy",
  pain_points: "muted",
  features: "white",
  arabic_first: "navy",
  testimonials: "muted",
  how_it_works: "white",
  pricing: "white",
  faq: "muted",
  final_cta: "navy",
};

/** Every string in a content object, keyed by its path (`items.0.q`). The
 * publish check and the inspector's "other language" line both read content
 * through this, so they agree on what a field is. */
export function flattenText(content: unknown, prefix = ""): Record<string, string> {
  if (typeof content === "string") return { [prefix]: content };
  if (content === null || typeof content !== "object") return {};
  return Object.entries(content).reduce<Record<string, string>>(
    (acc, [key, value]) => Object.assign(acc, flattenText(value, prefix ? `${prefix}.${key}` : key)),
    {}
  );
}
