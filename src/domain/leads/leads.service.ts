import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const LEAD_STATUSES = ["new", "contacted", "replied", "signed_up", "unsubscribed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type Lead = Database["public"]["Tables"]["leads"]["Row"];

export type LeadInput = {
  email: string;
  fullName: string | null;
  source: string | null;
  locale: "ar" | "en";
  notes: string | null;
};

export type LeadForSend = Pick<Lead, "id" | "email" | "full_name" | "status" | "unsubscribed_at" | "unsubscribe_token">;

function toRow(input: LeadInput) {
  return {
    email: input.email,
    full_name: input.fullName,
    source: input.source,
    locale: input.locale,
    notes: input.notes,
  };
}

/** Prospective coaches the admin emails by hand. Every call runs as the
 * signed-in admin: the tables are admin-only through RLS (see
 * 20261022000001_leads.sql), which also lowercases the address and keeps an
 * unsubscribed lead unsubscribed. */
export class LeadsService {
  constructor(private db: SupabaseClient<Database>) {}

  async list(): Promise<Lead[]> {
    const { data, error } = await this.db.from("leads").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async create(input: LeadInput): Promise<void> {
    const { error } = await this.db.from("leads").insert(toRow(input));
    if (error) throw error;
  }

  async update(id: string, input: LeadInput): Promise<void> {
    const { error } = await this.db.from("leads").update(toRow(input)).eq("id", id);
    if (error) throw error;
  }

  async setStatus(id: string, status: LeadStatus): Promise<void> {
    const { error } = await this.db.from("leads").update({ status }).eq("id", id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("leads").delete().eq("id", id);
    if (error) throw error;
  }

  /** Inserts the rows whose address is not a lead yet and returns how many
   * that was. */
  async importMany(rows: { email: string; name: string | null; source: string | null }[]): Promise<number> {
    if (rows.length === 0) return 0;
    const { data, error } = await this.db
      .from("leads")
      .upsert(
        rows.map((row) => ({ email: row.email, full_name: row.name, source: row.source })),
        { onConflict: "email", ignoreDuplicates: true }
      )
      .select("id");
    if (error) throw error;
    return data.length;
  }

  /** The lead as it is right now, read just before its email goes out. */
  async getForSend(id: string): Promise<LeadForSend | null> {
    const { data, error } = await this.db
      .from("leads")
      .select("id, email, full_name, status, unsubscribed_at, unsubscribe_token")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async recordSend(send: {
    leadId: string;
    subject: string;
    messageId: string | null;
    error: string | null;
    sentBy: string;
  }): Promise<void> {
    const { error } = await this.db.from("lead_email_sends").insert({
      lead_id: send.leadId,
      subject: send.subject,
      brevo_message_id: send.messageId,
      status: send.error ? "failed" : "sent",
      error: send.error ? send.error.slice(0, 500) : null,
      sent_by: send.sentBy,
    });
    if (error) throw error;
  }

  /** After a successful send. Only a `new` lead moves to `contacted`: a lead
   * who replied or signed up keeps that status. */
  async markContacted(lead: Pick<Lead, "id" | "status">, at: Date): Promise<void> {
    const { error } = await this.db
      .from("leads")
      .update({ last_contacted_at: at.toISOString(), ...(lead.status === "new" ? { status: "contacted" } : {}) })
      .eq("id", lead.id);
    if (error) throw error;
  }
}
