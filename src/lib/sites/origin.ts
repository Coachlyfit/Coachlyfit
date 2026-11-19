import { getRootDomain } from "@/lib/tenant/portal-slug";

/** Public origin of a coach site: its custom domain, else the white-label
 * `<slug>.<root domain>` address. */
export function siteOrigin(site: { domain: string | null; coach: { slug: string } }): string {
  if (site.domain) return `https://${site.domain}`;
  const root = getRootDomain();
  const local = root === "localhost";
  return `${local ? "http" : "https"}://${site.coach.slug}.${root}`;
}

/** Canonical + hreflang links for the one-page site. The language is chosen
 * with `?lang=en`; Arabic (the default) has no query. */
export function siteAlternates(origin: string, locale: "ar" | "en") {
  const ar = `${origin}/`;
  const en = `${origin}/?lang=en`;
  return {
    canonical: locale === "en" ? en : ar,
    languages: { ar, en, "x-default": ar },
  };
}
