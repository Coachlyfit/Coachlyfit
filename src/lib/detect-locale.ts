export type DetectedLocale = "ar" | "en";

/** Locale for global-error.tsx, which renders without next-intl: URL first
 * segment, then the NEXT_LOCALE cookie, then `ar` (the default locale). */
export function detectLocale(pathname: string, cookie: string): DetectedLocale {
  const seg = pathname.split("/")[1];
  if (seg === "ar" || seg === "en") return seg;
  const c = cookie.match(/(?:^|;\s*)NEXT_LOCALE=(ar|en)(?:;|$)/)?.[1];
  return c === "en" ? "en" : "ar";
}
