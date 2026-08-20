import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { PastNote } from "./note-similarity";

type Checkin = Database["public"]["Tables"]["checkins"]["Row"];

export type PendingCheckin = Checkin & {
  clients: { id: string; display_name: string } | null;
};

export type ReviewDecision = "keep" | "adjust" | "call";

export type ReviewInput = {
  decision: ReviewDecision;
  adjustments?: string[];
  coachReply?: string;
};

const RECENT_NOTES_LIMIT = 8;

/** The coach's weekly review queue and the write path for clearing it.
 * RLS's coach_read policy (20260731000009_progress.sql) already scopes
 * every read here to the caller's own clients — no coachId argument needed,
 * same as ProgressService.listCheckins. */
export class ReviewService {
  constructor(private db: SupabaseClient<Database>) {}

  /** Oldest first — the coach works the backlog in submission order, same
   * queue-ordering reasoning as the dashboard's form-submissions list. */
  async listPendingQueue(): Promise<PendingCheckin[]> {
    const { data, error } = await this.db
      .from("checkins")
      .select("*, clients(id, display_name)")
      .is("reviewed_at", null)
      .order("checkin_date", { ascending: true });
    if (error) throw error;
    return data;
  }

  /** Past notes for the same client, most recent first, for the "said this
   * before" section — excludes the check-in being reviewed. Matching itself
   * (findSimilarNotes, in note-similarity.ts) is a pure function so it's
   * testable without a database. */
  async listRecentNotes(clientId: string, excludeCheckinId: string): Promise<PastNote[]> {
    const { data, error } = await this.db
      .from("checkins")
      .select("checkin_date, notes")
      .eq("client_id", clientId)
      .neq("id", excludeCheckinId)
      .not("notes", "is", null)
      .order("checkin_date", { ascending: false })
      .limit(RECENT_NOTES_LIMIT);
    if (error) throw error;
    return data;
  }

  /** The only write path for a review. See review_checkin() in
   * 20260804000001_checkin_review.sql for why: RLS can't scope an UPDATE to
   * specific columns, and the coach has no UPDATE grant on checkins at all —
   * editing a client's own answers would be misleading data, same reasoning
   * as the rest of this table. */
  async reviewCheckin(checkinId: string, input: ReviewInput): Promise<Checkin> {
    const { data, error } = await this.db.rpc("review_checkin", {
      p_checkin_id: checkinId,
      p_decision: input.decision,
      p_adjustments: input.adjustments ?? undefined,
      p_coach_reply: input.coachReply ?? undefined,
    });
    if (error) throw error;
    return data;
  }
}
