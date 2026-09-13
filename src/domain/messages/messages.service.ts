import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Message = Database["public"]["Tables"]["messages"]["Row"];
type InboxThreadRow = Database["public"]["Views"]["coach_inbox_threads"]["Row"];

// Supabase's generated view types mark every column nullable (views carry no
// NOT NULL metadata), but client_id/coach_id/display_name/status/unread_count
// are guaranteed non-null by the underlying clients columns and the view's
// own `coalesce(..., 0)`. Only the last-message columns are genuinely
// nullable (a client with no messages yet). Narrow once here so every
// consumer isn't re-checking columns that can't actually be null.
export type InboxThread = {
  client_id: string;
  coach_id: string;
  display_name: string;
  status: InboxThreadRow["status"];
  last_body: string | null;
  last_sender_role: "coach" | "client" | null;
  last_message_at: string | null;
  unread_count: number;
};

export type SendMessageInput = {
  sender_role: "coach" | "client";
  body: string;
};

const THREAD_LIMIT = 50;

/** One thread per client — coach and client both read/write their own
 * thread (RLS: coach_rw + client_rw, both full-CRUD, unlike the checkins
 * one-sided coach_read/client_own split). coach_id/client_id are supplied
 * by the caller (a route/action that already resolved the current user's
 * own identity), same shape as ProgressService.submitCheckin — never
 * trusted from arbitrary request input beyond that resolved identity. */
export class MessagesService {
  constructor(private db: SupabaseClient<Database>) {}

  /** Inbox summary: one row per active client, via the coach_inbox_threads
   * view (last message + unread count precomputed in SQL, not N+1 queries).
   * Sorted unread-first, then most-recently-active, then name — a coach's
   * attention should land on what needs a reply, not just what's newest. */
  async listInbox(): Promise<InboxThread[]> {
    const { data, error } = await this.db.from("coach_inbox_threads").select("*").eq("status", "active");
    if (error) throw error;
    const threads: InboxThread[] = data.map((row) => ({
      client_id: row.client_id as string,
      coach_id: row.coach_id as string,
      display_name: row.display_name as string,
      status: row.status,
      last_body: row.last_body,
      last_sender_role: row.last_sender_role as "coach" | "client" | null,
      last_message_at: row.last_message_at,
      unread_count: row.unread_count ?? 0,
    }));
    return threads.sort((a, b) => {
      if ((a.unread_count > 0) !== (b.unread_count > 0)) return a.unread_count > 0 ? -1 : 1;
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.display_name.localeCompare(b.display_name);
    });
  }

  async listThread(clientId: string, limit = THREAD_LIMIT): Promise<Message[]> {
    const { data, error } = await this.db
      .from("messages")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async send(coachId: string, clientId: string, input: SendMessageInput): Promise<Message> {
    const { data, error } = await this.db
      .from("messages")
      .insert({ coach_id: coachId, client_id: clientId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Sends the same message to every listed client in a single bulk insert
   * (not a loop of single inserts) — used for coach-to-all-active-clients
   * broadcasts. Callers don't need the created rows back. */
  async broadcast(coachId: string, clientIds: string[], body: string): Promise<void> {
    const { error } = await this.db.from("messages").insert(
      clientIds.map((clientId) => ({
        coach_id: coachId,
        client_id: clientId,
        sender_role: "coach" as const,
        body,
      })),
    );
    if (error) throw error;
  }

  /** Marks every message in the thread NOT sent by the caller as read —
   * the caller passes their own role so they never mark their own
   * outgoing messages read. */
  async markThreadRead(clientId: string, readerRole: "coach" | "client"): Promise<void> {
    const otherRole = readerRole === "coach" ? "client" : "coach";
    const { error } = await this.db
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .eq("sender_role", otherRole)
      .is("read_at", null);
    if (error) throw error;
  }
}
