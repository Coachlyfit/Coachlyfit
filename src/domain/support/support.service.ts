import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { SUPPORT_BUCKET, type TicketCategory, type TicketStatus } from "./support";

export type SupportTicket = Database["public"]["Tables"]["support_tickets"]["Row"];
export type TicketMessage = Database["public"]["Tables"]["ticket_messages"]["Row"];

// ponytail: every visible ticket in one read, filtered in the browser (the
// admin inbox does the same as the leads table). Page it, and move the
// filters into the query, when the inbox outgrows this.
const LIST_LIMIT = 500;

const SIGNED_URL_SECONDS = 60 * 60;

export type NewTicketInput = {
  id: string;
  messageId: string;
  subject: string;
  category: TicketCategory;
  body: string;
  attachmentPaths: string[];
};

export type ReplyInput = {
  id: string;
  body: string;
  attachmentPaths: string[];
  /** Admin only: a note the coach never sees. */
  internal?: boolean;
};

/** Support tickets between a tenant owner and the platform team. Who may see
 * or change what is decided in the database (20261024000001_support_tickets.sql):
 * the owner their own tickets, an admin everything, nobody else anything. So
 * these methods don't filter by role -- a coach's list() is already just
 * their tickets, and their messages() never contains an internal note. */
export class SupportService {
  constructor(private db: SupabaseClient<Database>) {}

  async list(): Promise<SupportTicket[]> {
    const { data, error } = await this.db
      .from("support_tickets")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(LIST_LIMIT);
    if (error) throw error;
    return data;
  }

  /** Null for a ticket the caller can't see. */
  async get(id: string): Promise<SupportTicket | null> {
    const { data, error } = await this.db.from("support_tickets").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async messages(ticketId: string): Promise<TicketMessage[]> {
    const { data, error } = await this.db
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  }

  /** Ticket and first message in one transaction (create_support_ticket).
   * The ids are the caller's because the files were uploaded under them. */
  async create(input: NewTicketInput): Promise<void> {
    const { error } = await this.db.rpc("create_support_ticket", {
      p_id: input.id,
      p_message_id: input.messageId,
      p_subject: input.subject,
      p_category: input.category,
      p_body: input.body,
      p_attachment_paths: input.attachmentPaths,
    });
    if (error) throw error;
  }

  /** sender_role and author_id are set by the database from the session
   * (private.ticket_messages_guard); what is sent here is only a placeholder
   * the column requires. */
  async reply(ticketId: string, input: ReplyInput): Promise<void> {
    const { error } = await this.db.from("ticket_messages").insert({
      id: input.id,
      ticket_id: ticketId,
      sender_role: "coach",
      body: input.body,
      attachment_paths: input.attachmentPaths,
      is_internal: input.internal ?? false,
    });
    if (error) throw error;
  }

  /** Admin only. False when RLS left no row to update. */
  async setStatus(id: string, status: TicketStatus): Promise<boolean> {
    const { data, error } = await this.db.from("support_tickets").update({ status }).eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Clears the caller's own side of the unread flag. */
  async markRead(id: string): Promise<void> {
    const { error } = await this.db.rpc("support_mark_read", { p_ticket_id: id });
    if (error) throw error;
  }

  async reopen(id: string): Promise<void> {
    const { error } = await this.db.rpc("support_reopen_ticket", { p_ticket_id: id });
    if (error) throw error;
  }

  /** Tickets waiting for this side to read, for the nav badge. */
  async unreadCount(side: "coach" | "admin"): Promise<number> {
    const { count, error } = await this.db
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq(side === "admin" ? "admin_unread" : "coach_unread", true);
    if (error) throw error;
    return count ?? 0;
  }

  /** Short-lived URLs keyed by storage path. A path that can't be signed
   * (removed, or not the caller's to read) is simply absent. */
  async signAttachments(paths: string[]): Promise<Record<string, string>> {
    if (paths.length === 0) return {};
    const { data, error } = await this.db.storage.from(SUPPORT_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) throw error;
    const urls: Record<string, string> = {};
    for (const item of data) {
      if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
    }
    return urls;
  }
}
