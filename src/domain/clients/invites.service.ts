import { randomBytes, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

function generateToken() {
  return randomBytes(24).toString("base64url");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type CreateInviteInput = {
  displayName: string;
  email?: string;
  phone?: string;
};

/** Coach-side half of the invite flow: create the client roster row plus a
 * hashed, single-use invite token. The plaintext token is returned once —
 * only its sha256 hash (matching Postgres's `digest(token, 'sha256')` in
 * accept_invite(), see supabase/migrations/..._clients_invites.sql) is
 * ever persisted. */
export class InvitesService {
  constructor(private db: SupabaseClient<Database>) {}

  async createInvite(coachId: string, input: CreateInviteInput) {
    const { data: client, error: clientError } = await this.db
      .from("clients")
      .insert({
        coach_id: coachId,
        display_name: input.displayName,
        email: input.email || null,
        phone: input.phone || null,
      })
      .select("id")
      .single();
    if (clientError) throw clientError;

    const token = generateToken();
    const { error: inviteError } = await this.db.from("invites").insert({
      coach_id: coachId,
      client_id: client.id,
      token_hash: hashToken(token),
    });
    if (inviteError) throw inviteError;

    return { token, clientId: client.id as string };
  }

  /** A coach who closed the invite dialog before copying the link has no
   * way to recover it (only the hash is stored) — this issues a fresh
   * token for the same client rather than leaving them stuck. */
  async regenerateInvite(coachId: string, clientId: string) {
    const token = generateToken();
    const { error } = await this.db.from("invites").insert({
      coach_id: coachId,
      client_id: clientId,
      token_hash: hashToken(token),
    });
    if (error) throw error;
    return { token };
  }

  /** Onboarding's paste-import: one createInvite per row, sequential like
   * ProgramsService.cloneToClient (PostgREST has no cross-insert
   * transaction). A row failing the client-cap trigger (23514) must not
   * abort the rows already accepted, so failures are counted, not thrown. */
  async createInvites(coachId: string, inputs: CreateInviteInput[]) {
    const created: { clientId: string; token: string; displayName: string }[] = [];
    let failed = 0;

    for (const input of inputs) {
      try {
        const { token, clientId } = await this.createInvite(coachId, input);
        created.push({ clientId, token, displayName: input.displayName });
      } catch {
        failed++;
      }
    }

    return { created, failed };
  }
}
