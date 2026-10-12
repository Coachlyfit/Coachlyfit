import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";
import { extractPortalSlug } from "@/lib/tenant/portal-slug";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`
// (same location, same default-export-a-function shape) — see
// https://nextjs.org/docs/messages/middleware-to-proxy. next-intl's
// createMiddleware() still returns the same request handler either way.
const intlMiddleware = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  // White-label subdomain (mona-fitness.<root domain>): forward the slug to
  // Server Components via a request header, read downstream with
  // `resolvePortalSlug()` (src/lib/tenant/portal-slug.ts). Mutating
  // request.headers in place (not constructing a fresh NextResponse.next({
  // request: { headers } }) here) so it composes with next-intl's own
  // rewrite/redirect below instead of racing it.
  // Falls back to a `?coach=` query param when there's no wildcard subdomain
  // set up yet (NEXT_PUBLIC_ROOT_DOMAIN unset / no *.domain DNS), so portal
  // links still work — see resolvePortalSlug().
  const slug = extractPortalSlug(request.headers.get("host")) ?? request.nextUrl.searchParams.get("coach");
  if (slug) {
    request.headers.set("x-coach-slug", slug);
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
