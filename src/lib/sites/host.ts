// Host / language decisions for the coach-website part of the proxy.
// Pure functions (no Next imports) so they can be unit-tested.

export type SiteLang = "ar" | "en";

/** `?lang=` wins, then the best Accept-Language match among ar/en, else the
 * app default (Arabic). */
export function pickSiteLang(queryLang: string | null, acceptLanguage: string | null): SiteLang {
  const q = queryLang?.toLowerCase();
  if (q === "ar" || q === "en") return q;

  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const weight = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { lang: tag.trim().toLowerCase().split("-")[0], weight: Number.isNaN(weight) ? 0 : weight };
    })
    .filter((x) => x.weight > 0 && (x.lang === "ar" || x.lang === "en"))
    .sort((a, b) => b.weight - a.weight);

  return (ranked[0]?.lang as SiteLang | undefined) ?? "ar";
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Hosts that are the platform itself, never a coach's custom domain. A
 * coach's `<slug>.<root>` subdomain is handled separately (extractPortalSlug). */
export function isPlatformHost(hostname: string, rootDomain: string): boolean {
  if (!hostname) return true;
  return (
    hostname === rootDomain ||
    hostname === `www.${rootDomain}` ||
    hostname === "localhost" ||
    hostname.endsWith(".vercel.app") ||
    IPV4.test(hostname)
  );
}

export type SiteStatus = "none" | "unpublished" | "published";

export type SiteCandidate = { key: string; custom: boolean };

/** Which site (if any) this request MIGHT belong to, before asking the
 * database. `slug` is the white-label subdomain, if any.
 *
 * - coach subdomain: only the root page and /review/* can belong to the site.
 *   Everything else (login, the app) stays on the platform.
 * - any non-platform host: a possible custom domain, every path. */
export function siteCandidate(args: {
  hostname: string;
  slug: string | null;
  pathname: string;
  rootDomain: string;
}): SiteCandidate | null {
  const { hostname, slug, pathname, rootDomain } = args;
  if (slug) {
    const ownsPath = pathname === "/" || pathname.startsWith("/review/");
    return ownsPath ? { key: slug, custom: false } : null;
  }
  return isPlatformHost(hostname, rootDomain) ? null : { key: hostname, custom: true };
}

/** A custom domain takes over once a site exists (an unpublished one renders
 * "coming soon"). A subdomain only does once the site is published, so a
 * coach who hasn't published keeps their normal portal at the subdomain root. */
export function servesSite(candidate: SiteCandidate, status: SiteStatus): boolean {
  return candidate.custom ? status !== "none" : status === "published";
}
