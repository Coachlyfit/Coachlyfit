import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { stopChannel, watchEvents } from "@/lib/google/events-api";
import type { AccessProvider } from "./access";
import { markNeedsReconnect, needsReconnect } from "./connection-state";

type Db = SupabaseClient<Database>;

export type WatchCounts = { created: number; renewed: number; failed: number; skipped: boolean };

// Google ends a channel after about a week. Renew with two days to spare, so
// one missed run (the daily job and the 3-minute sync both call ensure()) never
// lets a channel lapse.
const RENEW_WITHIN_MS = 48 * 3_600_000;
const LIFETIME_MS = 7 * 24 * 3_600_000;

/** Keeps one push-notification channel alive per active connection, on the
 * coach's "Coachly Fit" calendar, pointing at /api/google/webhook. A new or
 * renewed channel starts "dirty", so the next pull catches up. The old channel
 * is stopped (best effort) after the new one exists, so there is no gap.
 * Service-role client (cron path). */
export class GoogleWatchService {
  constructor(
    private db: Db,
    private accessFor: AccessProvider,
    /** Public origin of the app. Google only delivers to https, so anything else
     * (local dev) is skipped rather than failing every run. */
    private origin: string,
    private now: () => Date = () => new Date(),
    private deps = { watch: watchEvents, stop: stopChannel }
  ) {}

  async ensure(): Promise<WatchCounts> {
    const counts: WatchCounts = { created: 0, renewed: 0, failed: 0, skipped: false };
    if (!this.origin.startsWith("https://")) return { ...counts, skipped: true };

    const { data: connections, error } = await this.db
      .from("google_connections")
      .select("id, coach_id, google_watch_channels(channel_id, resource_id, expires_at, sync_token)")
      .eq("status", "active");
    if (error) throw error;

    for (const connection of connections ?? []) {
      const channels = connection.google_watch_channels;
      const current = Array.isArray(channels) ? channels[0] : channels;
      if (current && new Date(current.expires_at).getTime() - this.now().getTime() > RENEW_WITHIN_MS) continue;

      try {
        await this.register(connection.id, connection.coach_id, current ?? null);
        if (current) counts.renewed++;
        else counts.created++;
      } catch (error) {
        counts.failed++;
        if (needsReconnect(error)) await markNeedsReconnect(this.db, connection.coach_id);
      }
    }
    return counts;
  }

  private async register(
    connectionId: string,
    coachId: string,
    old: { channel_id: string; resource_id: string; sync_token: string | null } | null
  ): Promise<void> {
    const access = await this.accessFor(coachId);
    const channelId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const created = await this.deps.watch(access.accessToken, access.calendarId, {
      id: channelId,
      token,
      address: `${this.origin}/api/google/webhook`,
      expiration: this.now().getTime() + LIFETIME_MS,
    });

    const { error } = await this.db.from("google_watch_channels").upsert(
      {
        connection_id: connectionId,
        channel_id: channelId,
        resource_id: created.resourceId,
        channel_token: token,
        expires_at: new Date(Number(created.expiration)).toISOString(),
        // The sync token belongs to the calendar, not the channel: keep it.
        sync_token: old?.sync_token ?? null,
        dirty_at: this.now().toISOString(),
      },
      { onConflict: "connection_id" }
    );
    if (error) throw error;

    if (old) {
      await this.deps.stop(access.accessToken, { id: old.channel_id, resourceId: old.resource_id }).catch(() => undefined);
    }
  }
}
