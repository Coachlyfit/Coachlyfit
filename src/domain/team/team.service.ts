import { randomBytes, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

function generateToken() {
  return randomBytes(24).toString("base64url");
}
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Team-seat invites: unlike InvitesService, there's no separate roster row
 * to pre-create -- team_members IS both the roster and the invite, so
 * invite() is a single insert. See
 * supabase/migrations/20260824000001_team_members.sql for the accepting
 * side (accept_team_invite). */
export class TeamService {
  constructor(private db: SupabaseClient<Database>) {}

  async list(coachId: string) {
    const { data, error } = await this.db
      .from("team_members")
      .select("id, email, accepted_at")
      .eq("coach_id", coachId)
      .order("invited_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  /** Returns the plaintext token once -- only its sha256 hash (matching
   * Postgres's `digest(token, 'sha256')` in accept_team_invite()) is ever
   * persisted. */
  async invite(coachId: string, email: string) {
    const token = generateToken();
    const { error } = await this.db.from("team_members").insert({
      coach_id: coachId,
      email,
      token_hash: hashToken(token),
    });
    if (error) throw error;
    return { token };
  }

  async remove(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("team_members").delete().eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }
}
