export type AppLocale = "ar" | "en";

/** Picks the `_ar`/`_en` column pair for the active locale, falling back to
 * whichever one is populated if the preferred one is empty. Every bilingual
 * read in the app (exercise names, food names, tier names, form labels)
 * goes through this — one place to change if a third locale is ever added. */
export function pickLocale(
  row: Record<string, unknown>,
  locale: AppLocale,
  field: string = "name"
): string {
  const ar = row[`${field}_ar`] as string | undefined;
  const en = row[`${field}_en`] as string | undefined;
  return (locale === "ar" ? ar || en : en || ar) ?? "";
}

/** Same ar/en fallback as pickLocale, for values that are already a
 * `{ ar, en }` pair (form field labels/help/option text) instead of a
 * `_ar`/`_en`-suffixed row — e.g. the forms-runtime renderers reading
 * `field.label`. Delegates to pickLocale so there's still one fallback rule. */
export function pickBilingual(value: { ar: string; en: string }, locale: AppLocale): string {
  return pickLocale({ label_ar: value.ar, label_en: value.en }, locale, "label");
}
