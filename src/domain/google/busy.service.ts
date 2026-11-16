import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { queryFreeBusy } from "@/lib/google/events-api";
import type { AccessProvider } from "./access";
import { markNeedsReconnect, needsReconnect } from "./connection-state";

type Db = SupabaseClient<Database>;

export type BusyCounts = { refreshed: number; failed: number };

/** How far ahead clients can book; also how far we look for busy time. */
export const BUSY_WINDOW_DAYS = 60;

/** Copies each connected coach's Google busy time (start/end only, nothing
 * about the events) into google_busy_blocks. Slot generation reads it through
 * coach_busy_ranges, so a client is never offered a time the coach is busy in
 * Google, and no request path ever calls Google or needs the token. Runs in the
 * sync cron, so it is at most a few minutes behind. Service-role client. */
export class GoogleBusyService {
  constructor(
    private db: Db,
    private accessFor: AccessProvider,
    private now: () => Date = () => new Date(),
    private query: typeof queryFreeBusy = queryFreeBusy
  ) {}

  async refreshAll(): Promise<BusyCounts> {
    const counts: BusyCounts = { refreshed: 0, failed: 0 };
    const { data: connections, error } = await this.db.from("google_connections").select("coach_id").eq("status", "active");
    if (error) throw error;

    const from = this.now();
    const to = new Date(from.getTime() + BUSY_WINDOW_DAYS * 24 * 3_600_000);
    for (const { coach_id } of connections ?? []) {
      try {
        const access = await this.accessFor(coach_id);
        const busy = await this.query(access.accessToken, { timeMin: from.toISOString(), timeMax: to.toISOString() });
        const { error: rpcError } = await this.db.rpc("replace_google_busy", {
          p_coach_id: coach_id,
          p_blocks: busy.map((b) => ({ starts_at: b.start, ends_at: b.end })),
        });
        if (rpcError) throw rpcError;
        counts.refreshed++;
      } catch (error) {
        // On failure the previous blocks stay: stale busy time beats none.
        counts.failed++;
        if (needsReconnect(error)) await markNeedsReconnect(this.db, coach_id);
      }
    }
    return counts;
  }
}
