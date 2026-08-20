import type { AppLocale } from "@/domain/locale";

// numberingSystem: "latn" everywhere — ar-EG's default is Arabic-Indic
// digits (١٤/٠٨/٢٠٢٦), but Egyptian apps overwhelmingly use Western digits
// even in Arabic UI. Every Intl.DateTimeFormat/NumberFormat call in the app
// should go through these, not construct Intl.* directly.
export function formatDate(value: string | Date, locale: AppLocale, options?: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-EG", {
    numberingSystem: "latn",
    dateStyle: "medium",
    ...options,
  });
}

export function formatNumber(value: number, locale: AppLocale, options?: Intl.NumberFormatOptions) {
  return value.toLocaleString(locale === "ar" ? "ar-EG" : "en-EG", {
    numberingSystem: "latn",
    ...options,
  });
}
