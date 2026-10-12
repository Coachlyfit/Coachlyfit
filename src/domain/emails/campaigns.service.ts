import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { EmailDirection } from "./campaign-email";
import type { RecipientFilter } from "./recipients";

export type CampaignRecipient = {
  coachId: string;
  businessName: string;
  ownerName: string | null;
  email: string;
  status: string | null;
};

export type CampaignSummary = Pick<
  Database["public"]["Tables"]["email_campaigns"]["Row"],
  "id" | "subject" | "body" | "direction" | "recipient_count" | "sent_count" | "failed_count" | "created_at"
>;

export type RecipientResult = { coachId: string; email: string; error: string | null };

/** Admin email campaigns. Every call runs as the signed-in admin: the tables
 * are admin-only through RLS and admin_email_recipients() checks the role
 * itself (see 20261013000001_email_campaigns.sql). */
export class CampaignsService {
  constructor(private db: SupabaseClient<Database>) {}

  /** Coaches an admin can email, addresses included -- server-side only. */
  async listRecipients(): Promise<CampaignRecipient[]> {
    const { data, error } = await this.db.rpc("admin_email_recipients");
    if (error) throw error;
    return (data ?? []).map((row) => ({
      coachId: row.coach_id,
      businessName: row.business_name,
      ownerName: row.owner_name,
      email: row.email,
      status: row.status,
    }));
  }

  async createCampaign(input: {
    subject: string;
    body: string;
    direction: EmailDirection;
    filter: RecipientFilter;
    recipientCount: number;
    sentBy: string;
  }): Promise<string> {
    const { data, error } = await this.db
      .from("email_campaigns")
      .insert({
        subject: input.subject,
        body: input.body,
        direction: input.direction,
        recipient_filter: input.filter,
        recipient_count: input.recipientCount,
        sent_by: input.sentBy,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  /** One row per recipient with the outcome of its send. */
  async recordRecipients(campaignId: string, results: RecipientResult[], sentAt: Date): Promise<void> {
    if (results.length === 0) return;
    const { error } = await this.db.from("email_campaign_recipients").insert(
      results.map((result) => ({
        campaign_id: campaignId,
        coach_id: result.coachId,
        email: result.email,
        status: result.error ? "failed" : "sent",
        error: result.error ? result.error.slice(0, 500) : null,
        sent_at: result.error ? null : sentAt.toISOString(),
      }))
    );
    if (error) throw error;
  }

  async setCounts(campaignId: string, sent: number, failed: number): Promise<void> {
    const { error } = await this.db
      .from("email_campaigns")
      .update({ sent_count: sent, failed_count: failed })
      .eq("id", campaignId);
    if (error) throw error;
  }

  async listHistory(limit = 50): Promise<CampaignSummary[]> {
    const { data, error } = await this.db
      .from("email_campaigns")
      .select("id, subject, body, direction, recipient_count, sent_count, failed_count, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }
}
