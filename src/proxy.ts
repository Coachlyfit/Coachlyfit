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
  const slug = extractPortalSlug(request.headers.get("host"));
  if (slug) {
    request.headers.set("x-coach-slug", slug);
  }

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
