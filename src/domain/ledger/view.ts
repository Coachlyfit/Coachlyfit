import type { Database } from "@/lib/supabase/database.types";
import type { StructuredAdjustment } from "@/domain/progress/review.service";

type CoachingDecision = Database["public"]["Tables"]["coaching_decisions"]["Row"];

/** Maps a raw coaching_decisions row to the shape components/ledger/plan-
 * story.tsx (and the client home's decision card) expect — the jsonb
 * columns (adjustments/evidence) arrive untyped off the wire, so this is
 * the one place that cast happens instead of scattering `as unknown as`
 * across every page that reads a decision. */
export function toPlanStoryEntry(row: CoachingDecision, decidedByName?: string | null) {
  return {
    id: row.id,
    decision: row.decision as "keep" | "adjust" | "call",
    reasonKey: row.reason_key,
    clientNote: row.client_note,
    adjustments: (row.adjustments ?? []) as unknown as StructuredAdjustment[],
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    outcomeStatus: row.outcome_status as "pending" | "resolved" | "persisting" | "worse" | "not_evaluable",
    evaluatedAt: row.evaluated_at,
    decidedByName,
  };
}
