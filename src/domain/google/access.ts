import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { decryptToken } from "@/lib/crypto/token-crypto";
import { GoogleApiError } from "@/lib/google/errors";
import { refreshAccessToken } from "@/lib/google/oauth";

type Db = SupabaseClient<Database>;

export type CalendarAccess = { accessToken: string; calendarId: string };
export type AccessProvider = (coachId: string) => Promise<CalendarAccess>;

/** A short-lived Google access token + calendar id per coach, shared by every
 * stage of one sync run (push, watch, pull, freebusy), so a run refreshes each
 * coach's token once. Service-role client: the encrypted token isn't readable
 * by a user session. The decrypted refresh token lives in memory only for the
 * call and is never logged. A missing or dead connection throws the same
 * invalid_grant error Google would, which the callers turn into
 * "needs reconnect". */
export function createAccessProvider(db: Db): AccessProvider {
  const cache = new Map<string, Promise<CalendarAccess>>();

  async function load(coachId: string): Promise<CalendarAccess> {
    const { data: connection } = await db
      .from("google_connections")
      .select("encrypted_refresh_token, calendar_id")
      .eq("coach_id", coachId)
      .eq("status", "active")
      .maybeSingle();
    if (!connection) throw new GoogleApiError(400, "invalid_grant");
    const accessToken = await refreshAccessToken(decryptToken(connection.encrypted_refresh_token));
    return { accessToken, calendarId: connection.calendar_id };
  }

  return (coachId) => {
    let access = cache.get(coachId);
    if (!access) {
      access = load(coachId);
      cache.set(coachId, access);
    }
    return access;
  };
}
