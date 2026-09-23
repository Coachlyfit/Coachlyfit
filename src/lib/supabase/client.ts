import { createBrowserClient } from "@supabase/ssr";
import { getRootDomain } from "@/lib/tenant/portal-slug";
import type { Database } from "./database.types";

// One client per module load, used from Client Components. RLS (not this
// file) is what actually enforces tenant isolation — this just carries the
// caller's session to Postgres.
export function createClient() {
  const rootDomain = getRootDomain();
  const cookieDomain = rootDomain === "localhost" ? undefined : `.${rootDomain}`;

  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    cookieDomain ? { cookieOptions: { domain: cookieDomain } } : undefined
  );
}
