import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type UnsubscribeState = "invalid" | "active" | "unsubscribed";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads a lead's unsubscribe token, and with `confirm` unsubscribes them.
 * Runs as the anonymous visitor: lead_unsubscribe() is the only access that
 * role has to leads. Anything that isn't a live token is `invalid`, with no
 * hint as to why. */
export async function leadUnsubscribe(
  db: SupabaseClient<Database>,
  token: string | null | undefined,
  confirm: boolean
): Promise<UnsubscribeState> {
  if (!token || !UUID.test(token)) return "invalid";
  const { data, error } = await db.rpc("lead_unsubscribe", { p_token: token, p_confirm: confirm });
  if (error) {
    console.error("lead unsubscribe failed", error.message);
    return "invalid";
  }
  return data === "active" || data === "unsubscribed" ? data : "invalid";
}
