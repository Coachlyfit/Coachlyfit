import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { StructuredAdjustment } from "@/domain/progress/review.service";
import type { ResultRow, SetLogRow, Signal } from "./signals";
import type { OutcomeResult } from "./outcomes";
import type { ReasonKey } from "./reasons";

type CoachingDecision = Database["public"]["Tables"]["coaching_decisions"]["Row"];
type DecisionKind = "keep" | "adjust" | "call";

export type CreateDecisionInput = {
  coachId: string;
  clientId: string;
  checkinId: string;
  programId: string | null;
  decision: DecisionKind;
  reasonKey: ReasonKey;
  clientNote: string | null;
  adjustments: StructuredAdjustment[];
  evidence: Signal[];
  affectedItemIds: string[];
};

/** Signal inputs for one review page's worth of clients, batched instead
 * of one query per client — same "no N+1" reasoning as review/page.tsx's
 * existing `.in("client_id", clientIds)` reads for checkins/media/sessions.
 * Both tables already carry `program_item_id` directly (no join to
 * program_items needed), which is what lets signals.ts key evidence off
 * the prescribed item instead of a resolved exercise identity. */
export type SignalInputs = { resultsByClient: Map<string, ResultRow[]>; logsByClient: Map<string, SetLogRow[]> };

const SIGNAL_LOOKBACK_DAYS = 30;

function groupByClient<T extends { client_id: string }>(rows: T[]): Map<string, Omit<T, "client_id">[]> {
  const byClient = new Map<string, Omit<T, "client_id">[]>();
  for (const { client_id, ...rest } of rows) {
    const bucket = byClient.get(client_id);
    if (bucket) bucket.push(rest);
    else byClient.set(client_id, [rest]);
  }
  return byClient;
}

/** The Coaching Ledger's write/read path — one record per coach decision
 * (Signal -> Decision -> Change -> Outcome), linking a check-in review to
 * the program revision it produced and, later, to whether it worked. See
 * 20260925000001_coaching_decisions.sql for the RLS shape: the coach
 * reads/writes their own tenant, the client can only read their own rows
 * (no client write grant at all — same "coach owns the record" reasoning
 * as ReviewService/checkins). */
export class LedgerService {
  constructor(private db: SupabaseClient<Database>) {}

  /** One signal-input query pair for every client in the review queue —
   * call once per page render, then slice per client with groupByClient's
   * output. `sinceIso` defaults to SIGNAL_LOOKBACK_DAYS back, which covers
   * both detectors' lookback windows (pain's 14-day window, missed-reps'
   * "last 2 sessions") with headroom; pass an explicit value to widen it. */
  async loadSignalInputs(clientIds: string[], sinceIso = new Date(Date.now() - SIGNAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()): Promise<SignalInputs> {
    if (clientIds.length === 0) return { resultsByClient: new Map(), logsByClient: new Map() };

    const [{ data: results, error: resultsError }, { data: logs, error: logsError }] = await Promise.all([
      this.db
        .from("workout_exercise_results")
        .select("client_id, program_item_id, session_id, pain, created_at")
        .in("client_id", clientIds)
        .gte("created_at", sinceIso),
      this.db
        .from("workout_set_logs")
        .select("client_id, program_item_id, session_id, reps, prescribed_reps, completed_at")
        .in("client_id", clientIds)
        .gte("completed_at", sinceIso),
    ]);
    if (resultsError) throw resultsError;
    if (logsError) throw logsError;

    return {
      resultsByClient: groupByClient(results) as Map<string, ResultRow[]>,
      logsByClient: groupByClient(logs) as Map<string, SetLogRow[]>,
    };
  }

  /** Called from submitReviewAction right after ReviewService.reviewCheckin
   * — one decision per check-in review. Upserted on checkin_id (unique):
   * review_checkin's own RPC allows re-submitting a review (no guard
   * against it), so a coach correcting their decision updates the same
   * ledger row instead of forking it. */
  async createFromReview(input: CreateDecisionInput): Promise<CoachingDecision> {
    const { data, error } = await this.db
      .from("coaching_decisions")
      .upsert(
        {
          coach_id: input.coachId,
          client_id: input.clientId,
          checkin_id: input.checkinId,
          program_id: input.programId,
          decision: input.decision,
          reason_key: input.reasonKey,
          client_note: input.clientNote,
          adjustments: input.adjustments as unknown as Database["public"]["Tables"]["coaching_decisions"]["Insert"]["adjustments"],
          evidence: input.evidence as unknown as Database["public"]["Tables"]["coaching_decisions"]["Insert"]["evidence"],
          affected_item_ids: input.affectedItemIds,
        },
        { onConflict: "checkin_id" }
      )
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  /** Links the applied program change back to its decision — called from
   * applyAdjustmentAction right after ProgramsService.snapshotIfAssigned
   * and ReviewService.markAdjustmentApplied. `affectedItemIds` overwrites
   * the decision's initial item list with the ones actually mutated
   * (reduceLoad's "whole program" case resolves to a concrete id list only
   * at apply time — see applyAdjustmentAction). */
  async markApplied(checkinId: string, input: { revisionId: string | null; affectedItemIds: string[] }): Promise<void> {
    const { error } = await this.db
      .from("coaching_decisions")
      .update({ applied_at: new Date().toISOString(), revision_id: input.revisionId, affected_item_ids: input.affectedItemIds })
      .eq("checkin_id", checkinId);
    if (error) throw error;
  }

  /** Most recent first — the client profile's Decisions tab and the
   * client's own "My Plan Story" timeline both want newest-on-top, same
   * ordering as ReviewService.listRecentNotes. */
  async listForClient(clientId: string, limit = 20): Promise<CoachingDecision[]> {
    const { data, error } = await this.db
      .from("coaching_decisions")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  /** Coach-side counterpart to listForClient — same rows, plus the
   * deciding staff member's name (via decided_by, the one direct FK this
   * table has to profiles, so the embed resolves unambiguously) for the
   * client profile's Decisions tab. Client-facing surfaces never need this
   * — which specific staff member decided isn't the client's business —
   * so it stays a separate method rather than widening listForClient's
   * return type for every caller. */
  async listForClientWithDeciderName(clientId: string, limit = 20): Promise<(CoachingDecision & { profiles: { full_name: string | null } | null })[]> {
    const { data, error } = await this.db
      .from("coaching_decisions")
      .select("*, profiles(full_name)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  /** The client home's Coach Decision card: the newest not-yet-seen
   * decision, or (once everything's been seen) the newest from the last
   * week — a client who already read it shouldn't lose the card the
   * moment they refresh, only once it's genuinely old news. */
  async latestUnseenForClient(clientId: string, recentDays = 7): Promise<CoachingDecision | null> {
    const { data: unseen, error: unseenError } = await this.db
      .from("coaching_decisions")
      .select("*")
      .eq("client_id", clientId)
      .is("client_seen_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (unseenError) throw unseenError;
    if (unseen) return unseen;

    const since = new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent, error: recentError } = await this.db
      .from("coaching_decisions")
      .select("*")
      .eq("client_id", clientId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentError) throw recentError;
    return recent;
  }

  /** program_item_id -> reason_key for every item an applied adjust
   * decision touched recently — the workout runner's "why" chip data
   * source. Only `adjust` decisions carry a program change; `keep`/`call`
   * have nothing to show inline in the runner. */
  async listActiveAdjustedItemIds(clientId: string, sinceDays = 14): Promise<Map<string, ReasonKey>> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.db
      .from("coaching_decisions")
      .select("reason_key, affected_item_ids")
      .eq("client_id", clientId)
      .eq("decision", "adjust")
      .not("applied_at", "is", null)
      .gte("applied_at", since);
    if (error) throw error;

    const map = new Map<string, ReasonKey>();
    for (const row of data) {
      for (const itemId of row.affected_item_ids) map.set(itemId, row.reason_key as ReasonKey);
    }
    return map;
  }

  /** The coach dashboard's Follow-ups card — decisions the outcome cron
   * evaluated in the last `sinceDays`, worst first (worse before
   * persisting before resolved) so a coach scanning the card sees what
   * needs attention before what's just good news. RLS's coach_rw already
   * scopes this to the caller's own tenant. */
  async listRecentOutcomes(sinceDays = 7): Promise<(CoachingDecision & { clients: { display_name: string } | null })[]> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.db
      .from("coaching_decisions")
      .select("*, clients(display_name)")
      .neq("outcome_status", "pending")
      .gte("evaluated_at", since)
      .order("evaluated_at", { ascending: false });
    if (error) throw error;

    const rank: Record<string, number> = { worse: 0, persisting: 1, not_evaluable: 2, resolved: 3 };
    return [...data].sort((a, b) => (rank[a.outcome_status] ?? 9) - (rank[b.outcome_status] ?? 9));
  }

  /** Client-side read receipt — see mark_decision_seen in
   * 20260925000001_coaching_decisions.sql for why this is an RPC and not a
   * raw update: the client has no UPDATE grant on coaching_decisions at
   * all, same reasoning as ReviewService.markSeen. */
  async markSeen(decisionId: string): Promise<void> {
    const { error } = await this.db.rpc("mark_decision_seen", { p_decision_id: decisionId });
    if (error) throw error;
  }

  /** Decisions the outcome cron should re-check today: applied `adjust`
   * decisions still `pending`, plus `keep`/`call` decisions that carry
   * evidence but were never "applied" (there's no program mutation to
   * link — the cron's `since` for those falls back to created_at, handled
   * by the caller). Meant to run against the admin client (service_role),
   * same trusted-job reasoning as billing-lifecycle's cron route. */
  async listDueForEvaluation(): Promise<CoachingDecision[]> {
    const { data, error } = await this.db.from("coaching_decisions").select("*").eq("outcome_status", "pending");
    if (error) throw error;
    // Empty-evidence decisions (keep/call with nothing to re-check) filtered
    // in JS rather than a jsonb-array-length filter in the query — simpler
    // than PostgREST's jsonb operator syntax for what's a small admin-only
    // scan, not a hot path.
    return data.filter((d) => Array.isArray(d.evidence) && d.evidence.length > 0);
  }

  async recordOutcome(decisionId: string, result: OutcomeResult): Promise<void> {
    const { error } = await this.db
      .from("coaching_decisions")
      .update({
        outcome_status: result.status,
        outcome_evidence: result.evidence as unknown as Database["public"]["Tables"]["coaching_decisions"]["Update"]["outcome_evidence"],
        evaluated_at: new Date().toISOString(),
      })
      .eq("id", decisionId);
    if (error) throw error;
  }
}
