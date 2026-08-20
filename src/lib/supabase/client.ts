import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// One client per module load, used from Client Components. RLS (not this
// file) is what actually enforces tenant isolation — this just carries the
// caller's session to Postgres.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
