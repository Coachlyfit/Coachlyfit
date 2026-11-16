import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// service_role bypasses RLS entirely. Use ONLY for the cron lifecycle
// route (a trusted job authenticated via CRON_SECRET, not a user session),
// test setup, and the OAuth callback's guarded Auth Admin deleteUser of a
// just-created Google account — never for data access, where the
// server/browser clients above are what keep tenant isolation real.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
