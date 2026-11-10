import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { avatarPublicUrl } from "@/lib/avatar-url";
import { homeWindow, invoicePaymentStatus, quietClients, type PaymentStatus, type QuietClient } from "./coach-home";

export const INBOX_FILTERS = ["all", "new", "reviewed"] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export type InboxRow = {
  id: string;
  clientId: string;
  clientName: string;
  avatarUrl: string | null;
  submittedAt: string;
  reviewed: boolean;
};

export type PaymentRow = {
  id: string;
  clientName: string;
  dueDate: string;
  total: number;
  currency: string;
  status: PaymentStatus;
};

export type AttentionCounts = {
  awaitingReview: number;
  overdueInvoices: number;
  programsEnding: number;
  pendingCheckins: number;
};

// A client silent for longer than this reads as "no check-in yet" rather
// than a day count -- same window the clients roster loads.
const QUIET_LOOKBACK_DAYS = 90;

/** Read side of the coach home page. No coachId argument anywhere: every
 * table here is scoped to the caller by its own RLS policy, same as
 * ReviewService. */
export class CoachHomeService {
  constructor(private db: SupabaseClient<Database>) {}

  async attentionCounts(now: Date): Promise<AttentionCounts> {
    const { today, weekEnd } = homeWindow(now);
    const [submissions, invoices, programs, checkins] = await Promise.all([
      this.db.from("form_submissions").select("id", { count: "exact", head: true }).is("reviewed_at", null),
      // An invoice with no due_date can't be overdue -- `lt` drops nulls.
      this.db.from("invoices").select("id", { count: "exact", head: true }).eq("status", "issued").lt("due_date", today),
      // client_id null is a template, not a program anyone is on.
      this.db
        .from("programs")
        .select("id", { count: "exact", head: true })
        .not("client_id", "is", null)
        .is("archived_at", null)
        .gte("end_date", today)
        .lte("end_date", weekEnd),
      this.db.from("checkins").select("id", { count: "exact", head: true }).is("reviewed_at", null),
    ]);
    for (const { error } of [submissions, invoices, programs, checkins]) if (error) throw error;

    return {
      awaitingReview: submissions.count ?? 0,
      overdueInvoices: invoices.count ?? 0,
      programsEnding: programs.count ?? 0,
      pendingCheckins: checkins.count ?? 0,
    };
  }

  async listInbox(filter: InboxFilter, limit: number): Promise<InboxRow[]> {
    let query = this.db
      .from("checkins")
      .select("id, client_id, checkin_date, reviewed_at, clients(display_name, profiles(avatar_url))")
      .order("checkin_date", { ascending: false })
      .limit(limit);
    if (filter === "new") query = query.is("reviewed_at", null);
    if (filter === "reviewed") query = query.not("reviewed_at", "is", null);

    const { data, error } = await query;
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      clientName: row.clients?.display_name ?? "",
      avatarUrl: avatarPublicUrl(row.clients?.profiles?.avatar_url),
      submittedAt: row.checkin_date,
      reviewed: row.reviewed_at != null,
    }));
  }

  async listQuietClients(now: Date, limit: number): Promise<QuietClient[]> {
    const since = new Date(now.getTime() - QUIET_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [clients, checkins] = await Promise.all([
      this.db.from("clients").select("id, display_name, status, profiles(avatar_url)").eq("status", "active"),
      this.db.from("checkins").select("client_id, checkin_date").gte("checkin_date", since),
    ]);
    if (clients.error) throw clients.error;
    if (checkins.error) throw checkins.error;
    const avatars = new Map(clients.data.map((c) => [c.id, avatarPublicUrl(c.profiles?.avatar_url)]));
    return quietClients(clients.data, checkins.data, now)
      .slice(0, limit)
      .map((c) => ({ ...c, avatarUrl: avatars.get(c.id) ?? null }));
  }

  /** Invoices falling due around now. There is no paid_at column, so a paid
   * invoice is placed by its due_date like the rest. */
  async listPaymentsThisWeek(now: Date, limit: number): Promise<PaymentRow[]> {
    const { today, weekEnd, paymentsFrom } = homeWindow(now);
    const { data, error } = await this.db
      .from("invoices")
      .select("id, total, currency, status, due_date, clients(display_name)")
      .in("status", ["issued", "paid"])
      .gte("due_date", paymentsFrom)
      .lte("due_date", weekEnd)
      .order("due_date", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      clientName: row.clients?.display_name ?? "",
      dueDate: row.due_date!,
      total: row.total,
      currency: row.currency,
      status: invoicePaymentStatus(row, today),
    }));
  }
}
