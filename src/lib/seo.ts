import { routing, type AppLocale } from "@/i18n/routing";

/** Canonical origin for SEO output: https, no trailing slash. Falls back to
 * NEXT_PUBLIC_APP_URL so deployments without the new variable keep working. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");

/** `alternates` for a public page's metadata. `path` is the part after the
 * locale, e.g. "" for home or "/legal/terms". Only for indexable pages:
 * never set this in a layout, children inherit it. */
export function buildAlternates(locale: AppLocale, path = "") {
  return {
    canonical: `${SITE_URL}/${locale}${path}`,
    languages: {
      ...Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`])),
      "x-default": `${SITE_URL}/${routing.defaultLocale}${path}`,
    },
  };
}
