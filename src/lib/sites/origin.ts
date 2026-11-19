type SiteRef = { domain: string | null; coach: { slug: string } };
type Lang = "ar" | "en";

/** The app's own public URL (production: coachlyfit.vercel.app), no trailing slash. */
function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

/** Where a coach's site lives, as a full URL.
 *
 * 1. Custom domain: https://coachahmed.fit/
 * 2. Wildcard white-label subdomain, only when NEXT_PUBLIC_ROOT_DOMAIN is a
 *    real domain: https://<slug>.<root>/
 * 3. Otherwise (e.g. on *.vercel.app, which has no wildcard subdomains): the
 *    site route on the app's own URL: <app>/<lang>/sites/<slug>. It works
 *    everywhere with no DNS, and shows "coming soon" until published.
 *
 * `path` is a sub-path such as "/review/<token>". In cases 1 and 2 the
 * language rides on `?lang=`; in case 3 it's the path's locale segment. */
export function siteUrl(site: SiteRef, opts: { path?: string; lang?: Lang } = {}): string {
  const path = opts.path ?? "";
  const lang = opts.lang ?? "ar";
  const query = lang === "en" ? "?lang=en" : "";

  if (site.domain) return `https://${site.domain}${path || "/"}${query}`;

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim().split(":")[0].toLowerCase();
  if (root) {
    if (root === "localhost") {
      // Local wildcard testing: <slug>.localhost on the dev server's port.
      const port = new URL(appUrl()).port || "3000";
      return `http://${site.coach.slug}.localhost:${port}${path || "/"}${query}`;
    }
    return `https://${site.coach.slug}.${root}${path || "/"}${query}`;
  }

  return `${appUrl()}/${lang}/sites/${site.coach.slug}${path}`;
}

/** Where this coach's clients sign in. Always the platform's portal for the
 * coach (never the site itself, which owns "/" on the subdomain and every
 * path on a custom domain): https://<slug>.<root>/<lang>/login, or the app's
 * own URL with ?coach=<slug> when there is no wildcard domain. */
export function portalLoginUrl(coach: { slug: string }, lang: Lang): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim().split(":")[0].toLowerCase();
  if (root) {
    if (root === "localhost") {
      const port = new URL(appUrl()).port || "3000";
      return `http://${coach.slug}.localhost:${port}/${lang}/login`;
    }
    return `https://${coach.slug}.${root}/${lang}/login`;
  }
  return `${appUrl()}/${lang}/login?coach=${encodeURIComponent(coach.slug)}`;
}

/** Canonical + hreflang links for the one-page site. */
export function siteAlternates(site: SiteRef, locale: Lang) {
  const ar = siteUrl(site, { lang: "ar" });
  const en = siteUrl(site, { lang: "en" });
  return { canonical: locale === "en" ? en : ar, languages: { ar, en, "x-default": ar } };
}
