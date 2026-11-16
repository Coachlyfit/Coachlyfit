import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { GoogleApiError } from "@/lib/google/errors";

type Db = SupabaseClient<Database>;

/** The coach's grant is dead (revoked, expired, password change), or their
 * "Coachly Fit" calendar is gone (a 404 on the calendar itself: event-level
 * 404s are absorbed where they happen). */
export function needsReconnect(error: unknown): boolean {
  return error instanceof GoogleApiError && (error.isAuthRevoked || (error.status === 404 && error.reason === "notFound"));
}

/** Flip the connection once and tell the coach once. Their appointments keep
 * working; only the Google sync waits for a reconnect. A connection that is
 * already flagged (or deleted) changes nothing and sends nothing. */
export async function markNeedsReconnect(db: Db, coachId: string): Promise<void> {
  const { data } = await db
    .from("google_connections")
    .update({ status: "needs_reconnect" })
    .eq("coach_id", coachId)
    .eq("status", "active")
    .select("id");
  if ((data?.length ?? 0) > 0) {
    await db.from("notifications").insert({ profile_id: coachId, kind: "google_reconnect_needed", payload: {} });
  }
}
