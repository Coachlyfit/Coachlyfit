import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`
// (same location, same default-export-a-function shape) — see
// https://nextjs.org/docs/messages/middleware-to-proxy. next-intl's
// createMiddleware() still returns the same request handler either way.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals, static assets, and /auth/* — the
  // Supabase email-confirmation callback lives outside the locale prefix
  // (it's the fixed URL configured in the Supabase project's redirect
  // allow-list) and must never get locale-rewritten.
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
