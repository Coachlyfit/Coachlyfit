import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** Cookie-free anon client for public, cacheable reads (coach websites) and
 * the proxy. It can only call what the `anon` role may: the public RPCs.
 * No session, so it is safe inside unstable_cache and in the proxy. */
export function createAnonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
