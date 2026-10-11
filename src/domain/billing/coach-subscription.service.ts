import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const REQUEST_TYPES = ["change_plan", "reactivate", "other"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export type CreateRequestInput = { type: RequestType; tierId?: string; note?: string };

/** A coach's own platform subscription (coach -> Coachly Fit). The coach can
 * only file/withdraw a request and flip cancel-at-period-end; plan, status
 * and dates are written by admin RPCs and the lifecycle cron (see
 * 20261012000001_subscription_management.sql). Methods return the Postgres
 * error code (null = ok) so the action can map it to a message. */
export class CoachSubscriptionService {
  constructor(private db: SupabaseClient<Database>) {}

  async createRequest(coachId: string, input: CreateRequestInput): Promise<string | null> {
    const { error } = await this.db.from("subscription_requests").insert({
      coach_id: coachId,
      type: input.type,
      // The table requires a tier for change_plan and forbids it otherwise.
      tier_id: input.type === "change_plan" ? (input.tierId ?? null) : null,
      note: input.note?.trim() || null,
    });
    return error ? error.code || "unknown" : null;
  }

  /** false = nothing deleted (not the caller's, or already resolved). */
  async withdrawRequest(id: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("subscription_requests")
      .delete()
      .eq("id", id)
      .eq("status", "pending")
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async setCancelAtPeriodEnd(cancel: boolean): Promise<string | null> {
    const { error } = await this.db.rpc("set_my_subscription_cancel", { p_cancel: cancel });
    return error ? error.code || "unknown" : null;
  }
}
