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

// Each entry: the minimum diff (in seconds) to qualify for this unit, the
// unit's own size in seconds (the divisor), and the Intl unit to report.
// Checked largest-first so a 3-day-old message reports "3 days" rather than
// falling through to hours.
const RELATIVE_UNIT_BOUNDARIES: Array<{ minSeconds: number; unitSeconds: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { minSeconds: 60 * 60 * 24, unitSeconds: 60 * 60 * 24, unit: "day" },
  { minSeconds: 60 * 60, unitSeconds: 60 * 60, unit: "hour" },
  { minSeconds: 60, unitSeconds: 60, unit: "minute" },
];

/** "2h ago" style label for inbox previews. Falls back to formatDate's short
 * form past a week — nobody needs "23 days ago" precision, they need the
 * date. Same -EG locale + latn digits convention as formatDate/formatNumber. */
export function formatRelativeTime(value: string | Date, locale: AppLocale): string {
  const date = new Date(value);
  const diffSeconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  const relativeFormatter = new Intl.RelativeTimeFormat(rtfLocale(locale), { numeric: "auto" });

  if (diffSeconds < 60) return relativeFormatter.format(0, "second");
  if (diffSeconds >= 60 * 60 * 24 * 7) return formatDate(date, locale, { dateStyle: "short" });

  for (const boundary of RELATIVE_UNIT_BOUNDARIES) {
    if (diffSeconds >= boundary.minSeconds) {
      return relativeFormatter.format(-Math.floor(diffSeconds / boundary.unitSeconds), boundary.unit);
    }
  }
  return relativeFormatter.format(0, "second");
}

function rtfLocale(locale: AppLocale): string {
  return locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG-u-nu-latn";
}
