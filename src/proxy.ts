import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { pickSiteLang, servesSite, siteCandidate } from "@/lib/sites/host";
import { getSiteStatus } from "@/lib/sites/status";
import { updateSession } from "@/lib/supabase/middleware";
import { extractPortalSlug, getRootDomain } from "@/lib/tenant/portal-slug";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`
// (same location, same default-export-a-function shape) — see
// https://nextjs.org/docs/messages/middleware-to-proxy. next-intl's
// createMiddleware() still returns the same request handler either way.
const intlMiddleware = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  const slug = extractPortalSlug(host);

  // www.<root> is served by the *.<root> wildcard domain, so without this it
  // renders a full duplicate of the site for crawlers. Send it to the apex.
  const rootDomain = getRootDomain();
  if (hostname === `www.${rootDomain}`) {
    const url = request.nextUrl.clone();
    url.protocol = "https";
    url.hostname = rootDomain;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  // Coach website: a custom domain (every path), or a published coach's
  // subdomain root + /review/* links, is rewritten to the public site route.
  // The site is public and cached, so it skips next-intl and the auth session.
  const candidate = siteCandidate({
    hostname,
    slug,
    pathname: request.nextUrl.pathname,
    rootDomain: getRootDomain(),
  });
  if (candidate && servesSite(candidate, await getSiteStatus(candidate.key))) {
    const lang = pickSiteLang(request.nextUrl.searchParams.get("lang"), request.headers.get("accept-language"));
    const url = request.nextUrl.clone();
    url.pathname = `/${lang}/sites/${candidate.key}${request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname}`;
    const rewrite = NextResponse.rewrite(url);
    // Stay public and cheap for anonymous visitors, but if a client's auth
    // cookie is present keep it fresh: otherwise an expired access token
    // sits unrefreshed while they browse the site and they land on /login
    // when they open the portal.
    const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
    return hasSession ? updateSession(request, rewrite) : rewrite;
  }

  // White-label subdomain (mona-fitness.<root domain>): forward the slug to
  // Server Components via a request header, read downstream with
  // `resolvePortalSlug()` (src/lib/tenant/portal-slug.ts). Mutating
  // request.headers in place (not constructing a fresh NextResponse.next({
  // request: { headers } }) here) so it composes with next-intl's own
  // rewrite/redirect below instead of racing it.
  // Falls back to a `?coach=` query param when there's no wildcard subdomain
  // set up yet (NEXT_PUBLIC_ROOT_DOMAIN unset / no *.domain DNS), so portal
  // links still work — see resolvePortalSlug().
  const portalSlug = slug ?? request.nextUrl.searchParams.get("coach");
  if (portalSlug) {
    request.headers.set("x-coach-slug", portalSlug);
  }
  // Layouts aren't given the URL. The coach layout needs it to leave the
  // subscription page reachable for a coach whose subscription has lapsed.
  // Always set, so a value sent by the client never reaches it.
  request.headers.set("x-pathname", request.nextUrl.pathname);

  const response = intlMiddleware(request);
  return updateSession(request, response);
}

export const config = {
  // Skip API routes, Next internals, static assets, and /auth/* — the
  // Supabase email-confirmation callback lives outside the locale prefix
  // (it's the fixed URL configured in the Supabase project's redirect
  // allow-list) and must never get locale-rewritten.
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
