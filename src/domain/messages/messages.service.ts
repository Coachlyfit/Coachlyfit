import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Message = Database["public"]["Tables"]["messages"]["Row"];

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
