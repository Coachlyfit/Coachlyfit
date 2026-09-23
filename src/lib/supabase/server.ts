import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getRootDomain } from "@/lib/tenant/portal-slug";
import type { Database } from "./database.types";

// Request-scoped client for Server Components / Route Handlers / Server
// Actions. Carries the caller's session via cookies, so RLS still applies
// exactly as it does in the browser — this is not an elevated client.
export async function createClient() {
  const cookieStore = await cookies();
  const rootDomain = getRootDomain();
  const cookieDomain = rootDomain === "localhost" ? undefined : `.${rootDomain}`;

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, { ...options, domain: cookieDomain });
            }
          } catch {
            // Called from a Server Component render — a middleware refresh
            // handles session persistence in that case, so this is safe to
            // ignore (see https://supabase.com/docs/guides/auth/server-side/nextjs).
          }
        },
      },
    }
  );
}
