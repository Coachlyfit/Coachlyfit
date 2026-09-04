import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type PushSubscriptionRow = Database["public"]["Tables"]["push_subscriptions"]["Row"];

export type SubscribePushInput = { endpoint: string; p256dh: string; auth: string };

/** One row per browser/device a profile has opted into push on. RLS scopes
 * every read/write to the caller's own profile_id (push_subscriptions_own,
 * 20260911000001) — this service never takes a profile id argument, same
 * "RLS is the boundary, not the argument list" shape as NotificationsService. */
export class PushSubscriptionsService {
  constructor(private db: SupabaseClient<Database>) {}

  /** Re-subscribing the same browser (endpoint is unique) updates the keys
   * in place instead of erroring — a stale keypair after clearing site data
   * is the common case, not a conflict worth surfacing. */
  async subscribe(profileId: string, input: SubscribePushInput): Promise<void> {
    const { error } = await this.db
      .from("push_subscriptions")
      .upsert({ profile_id: profileId, ...input }, { onConflict: "endpoint" });
    if (error) throw error;
  }

  async unsubscribe(endpoint: string): Promise<void> {
    const { error } = await this.db.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) throw error;
  }

  async isSubscribed(endpoint: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", endpoint)
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  }
}
