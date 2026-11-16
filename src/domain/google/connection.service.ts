import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { decryptToken, encryptToken } from "@/lib/crypto/token-crypto";
import { createCalendar, deleteCalendar, stopChannel } from "@/lib/google/events-api";
import { refreshAccessToken, revokeToken } from "@/lib/google/oauth";

type Db = SupabaseClient<Database>;

/** The signed-in tenant owner's Google connection. Takes the caller's own
 * (RLS-scoped) client: writes go through the google_connect / google_disconnect
 * RPCs (20261123000003), which act on auth.uid()'s row only, because the token
 * table has no user write policies and the service-role client isn't allowed
 * in request paths. Tokens are encrypted before they leave this class and are
 * never logged or returned to the browser. */
export class GoogleConnectionService {
  constructor(private db: Db) {}

  /** Store a fresh grant: create the dedicated "Coachly Fit" calendar, save the
   * encrypted refresh token (the RPC also queues every upcoming appointment),
   * and drop the calendar of a previous connection. */
  async connect(args: {
    accessToken: string;
    refreshToken: string;
    scopes: string[];
    email: string | null;
    timeZone: string;
  }): Promise<void> {
    const calendarId = await createCalendar(args.accessToken, { summary: "Coachly Fit", timeZone: args.timeZone });

    const { data: previousCalendarId, error } = await this.db.rpc("google_connect", {
      p_encrypted_refresh_token: encryptToken(args.refreshToken),
      p_calendar_id: calendarId,
      p_email: args.email ?? "",
      p_scopes: args.scopes,
    });
    if (error) {
      // Don't leave a calendar behind that nothing points at.
      await deleteCalendar(args.accessToken, calendarId).catch(() => undefined);
      throw error;
    }

    // Reconnecting replaces our old calendar; remove it so the coach doesn't end up with two.
    if (previousCalendarId && previousCalendarId !== calendarId) {
      await deleteCalendar(args.accessToken, previousCalendarId).catch(() => undefined);
    }
  }

  /** Delete the stored connection (queued jobs, busy cache and watch channel
   * with it), then stop notifications and revoke at Google, optionally deleting
   * the Coachly Fit calendar. The Google-side steps are best effort: a token
   * Google already forgot must not leave the coach stuck. */
  async disconnect(opts: { deleteCalendar: boolean }): Promise<void> {
    const { data, error } = await this.db.rpc("google_disconnect");
    if (error) throw error;
    const connection = data?.[0];
    if (!connection) return;

    let refreshToken: string;
    try {
      refreshToken = decryptToken(connection.token);
    } catch {
      return; // Unreadable (key rotated): nothing to revoke with; the row is already gone.
    }

    // Stop notifications and (optionally) delete the calendar while the grant
    // still works, then revoke it. Every Google-side step is best effort.
    try {
      const accessToken = await refreshAccessToken(refreshToken);
      if (connection.channel_id && connection.resource_id) {
        await stopChannel(accessToken, { id: connection.channel_id, resourceId: connection.resource_id }).catch(() => undefined);
      }
      if (opts.deleteCalendar) await deleteCalendar(accessToken, connection.calendar);
    } catch {
      // Grant already dead or calendar already gone: carry on.
    }
    await revokeToken(refreshToken).catch(() => undefined);
  }
}
