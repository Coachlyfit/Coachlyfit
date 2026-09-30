import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type PendingCoachInvite = {
  id: string;
  created_at: string;
  coaches: { business_name: string } | null;
};

/** Raised by link_existing_client() when the email already belongs to one
 * of the caller's active clients. */
export class AlreadyYourClientError extends Error {
  constructor() {
    super("already_your_client");
  }
}

/** Client <-> coach links (coaching_relationships). Every write goes through
 * a security definer RPC (see
 * supabase/migrations/20260930000004_coaching_relationships.sql): switching
 * coaches has to end one relationship, start another, move billing and
 * notify the old coach atomically, which PostgREST can't do across calls. */
export class RelationshipsService {
  constructor(private db: SupabaseClient<Database>) {}

  /** Client side. RLS (client_read_own) scopes this to the caller. */
  async listPending(): Promise<PendingCoachInvite[]> {
    const { data, error } = await this.db
      .from("coaching_relationships")
      .select("id, created_at, coaches(business_name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  /** Client side. Accepting ends the current coach's relationship (and their
   * billing) in the same transaction. */
  async respond(relationshipId: string, accept: boolean, shareHistory: boolean): Promise<void> {
    const { error } = await this.db.rpc("respond_to_coach_invite", {
      p_relationship_id: relationshipId,
      p_accept: accept,
      p_share_history: shareHistory,
    });
    if (error) throw error;
  }

  /** Coach side. Returns the pending relationship id when the email already
   * has a client account, or null when it doesn't (caller creates a normal
   * invite instead). */
  async linkExisting(email: string): Promise<string | null> {
    const { data, error } = await this.db.rpc("link_existing_client", { p_email: email });
    if (error) {
      if (error.message === "already_your_client") throw new AlreadyYourClientError();
      throw error;
    }
    return data;
  }
}
