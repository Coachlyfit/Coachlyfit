import type { AppLocale } from "@/domain/locale";

// numberingSystem: "latn" everywhere — ar-EG's default is Arabic-Indic
// digits (١٤/٠٨/٢٠٢٦), but Egyptian apps overwhelmingly use Western digits
// even in Arabic UI. Every Intl.DateTimeFormat/NumberFormat call in the app
// should go through these, not construct Intl.* directly.
// Intl throws if `dateStyle` is combined with a component option like
// `month`/`day`/`weekday` -- even though `dateStyle: "medium"` is only meant
// as this function's default. Skip the default whenever a caller supplies
// any component option, instead of forcing every caller to override it.
const DATE_COMPONENT_KEYS = ["weekday", "year", "month", "day", "hour", "minute", "second", "timeZoneName"] as const;

export function formatDate(value: string | Date, locale: AppLocale, options?: Intl.DateTimeFormatOptions) {
  const hasComponentOptions = options != null && DATE_COMPONENT_KEYS.some((key) => options[key] !== undefined);
  // toLocaleString, not toLocaleDateString -- the latter can never accept
  // `timeStyle` (message-thread.tsx wants a short time), regardless of
  // dateStyle. toLocaleString is a strict superset for every option shape
  // this function ever builds, since it always injects at least one date-
  // related option (dateStyle or a component key) before the caller's own
  // options are spread on top, so it never falls back to toLocaleString's
  // "no options at all" behavior (which would print a full date+time).
  return new Date(value).toLocaleString(locale === "ar" ? "ar-EG" : "en-EG", {
    numberingSystem: "latn",
    ...(hasComponentOptions ? {} : { dateStyle: "medium" }),
    ...options,
  });
}

export function formatNumber(value: number, locale: AppLocale, options?: Intl.NumberFormatOptions) {
  return value.toLocaleString(locale === "ar" ? "ar-EG" : "en-EG", {
    numberingSystem: "latn",
    ...options,
  });
}
