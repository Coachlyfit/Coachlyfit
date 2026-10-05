import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;

export type UpdateClientInput = {
  display_name: string;
  email?: string;
  phone?: string;
};

/** Edit + archive/restore for a client row. Both were missing entirely —
 * `clients` only ever got written by InvitesService.createInvite and
 * accept_invite(). Status transitions here are the only place a client can
 * move to/from 'archived'; the DB re-checks the seat cap on restore
 * (clients_enforce_cap, extended in 20260923000001 to also fire on this
 * status update), so a coach can't dodge their tier limit by archiving and
 * restoring clients. */
export type RosterClient = {
  id: string;
  displayName: string;
  email: string | null;
  status: Database["public"]["Enums"]["client_status"];
  lastCheckin: string | null;
  adherence: number | null;
  program: { id: string; name_ar: string; name_en: string } | null;
  subscription: { status: "active" | "frozen" | "canceled"; end_date: string } | null;
};

export class ClientsService {
  constructor(private db: Db) {}

  /** The coach's whole roster in one query (coach_client_roster view). No
   * coachId argument: the view is security_invoker, so the caller's RLS on
   * clients and the joined tables does the scoping. */
  async listRoster(): Promise<RosterClient[]> {
    const { data, error } = await this.db
      .from("coach_client_roster")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    // Every view column is typed nullable; the ones asserted here come from
    // not-null columns on the driving `clients` row.
    return data.map((row) => ({
      id: row.client_id!,
      displayName: row.display_name!,
      email: row.email,
      status: row.status!,
      lastCheckin: row.last_checkin_date,
      adherence: row.adherence,
      program: row.program_id
        ? { id: row.program_id, name_ar: row.program_name_ar!, name_en: row.program_name_en! }
        : null,
      subscription: row.subscription_status
        ? {
            status: row.subscription_status as "active" | "frozen" | "canceled",
            end_date: row.subscription_end_date!,
          }
        : null,
    }));
  }

  async update(id: string, input: UpdateClientInput): Promise<boolean> {
    const { error } = await this.db
      .from("clients")
      .update({
        display_name: input.display_name,
        email: input.email || null,
        phone: input.phone || null,
      })
      .eq("id", id);
    return !error;
  }

  /** Restoring an invited-but-never-joined client goes back to 'invited';
   * one whose profile is already linked goes back to 'active'. Throws (does
   * not just return false) when the seat-cap trigger rejects the restore —
   * same convention as InvitesService.createInvite — so the caller can tell
   * "at cap" apart from "not found". */
  async setArchived(id: string, archived: boolean): Promise<boolean> {
    if (archived) {
      const { error } = await this.db.from("clients").update({ status: "archived" }).eq("id", id);
      return !error;
    }

    const { data: client, error: readError } = await this.db
      .from("clients")
      .select("profile_id")
      .eq("id", id)
      .maybeSingle();
    if (readError || !client) return false;

    const { error } = await this.db
      .from("clients")
      .update({ status: client.profile_id ? "active" : "invited" })
      .eq("id", id);
    if (error) throw error;
    return true;
  }
}
