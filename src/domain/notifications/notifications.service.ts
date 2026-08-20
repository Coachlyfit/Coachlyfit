import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

// The bell is a glance, not an inbox — a fixed recent window beats paging.
const RECENT_LIMIT = 20;

/** Read-and-acknowledge only. Notifications are produced exclusively by
 * security-definer functions (admin_promote_exercise/_food), which is why
 * there is no create method and no client insert policy. */
export class NotificationsService {
  constructor(private db: SupabaseClient<Database>) {}

  /** RLS (read_own) scopes this to the caller — no profile id argument, so
   * a client can't ask for someone else's notifications. */
  async listRecent(): Promise<Notification[]> {
    const { data, error } = await this.db
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT);
    if (error) throw error;
    return data;
  }

  async markAllRead(): Promise<void> {
    const { error } = await this.db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) throw error;
  }
}
