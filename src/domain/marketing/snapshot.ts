import type { AppLocale } from "@/domain/locale";
import { flattenText, sectionSchema, type Section, type Snapshot } from "./sections.schema";

export type PublishIssue =
  | { code: "no_visible_sections" }
  | { code: "invalid_content"; sectionId: string }
  // `locale` is the language the text is missing in.
  | { code: "missing_translation"; sectionId: string; path: string; locale: AppLocale };

/** What gets written to marketing_page_versions.snapshot: the whole draft in
 * page order. Hidden sections stay in so that restoring a version brings the
 * same draft back; the renderer leaves them out. */
export function buildSnapshot(sections: Section[]): Snapshot {
  return { sections: [...sections].sort((a, b) => a.position - b.position) };
}

/** Fields of a section that are filled in for one language and not the other.
 * A field left blank in both is a choice (no badge, no eyebrow), not a gap. */
export function missingTranslations(section: Pick<Section, "content_ar" | "content_en">) {
  const ar = flattenText(section.content_ar);
  const en = flattenText(section.content_en);
  const missing: { path: string; locale: AppLocale }[] = [];
  for (const path of new Set([...Object.keys(ar), ...Object.keys(en)])) {
    const hasAr = Boolean(ar[path]?.trim());
    const hasEn = Boolean(en[path]?.trim());
    if (hasAr !== hasEn) missing.push({ path, locale: hasAr ? "en" : "ar" });
  }
  return missing;
}

/** Why a draft can't be published. Empty means it can. Hidden sections are
 * not checked: they aren't shown to anyone. */
export function findPublishIssues(sections: Section[]): PublishIssue[] {
  const visible = sections.filter((s) => s.is_visible);
  if (visible.length === 0) return [{ code: "no_visible_sections" }];

  return visible.flatMap((section): PublishIssue[] => {
    if (!sectionSchema.safeParse(section).success) return [{ code: "invalid_content", sectionId: section.id }];
    return missingTranslations(section).map((m) => ({ code: "missing_translation", sectionId: section.id, ...m }));
  });
}
