import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LedgerService } from "@/domain/ledger/ledger.service";
import { evaluateOutcome } from "@/domain/ledger/outcomes";
import type { ResultRow, SetLogRow, Signal } from "@/domain/ledger/signals";

// Runs once daily via Vercel Cron (see vercel.json). Same admin-client
// justification as billing-lifecycle/notifications: a trusted job
// authenticated by CRON_SECRET, not a user session — RLS would otherwise
// scope this to a single coach's tenant, but the cron needs to sweep every
// coach's pending decisions in one pass.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const ledger = new LedgerService(supabase);

  const due = await ledger.listDueForEvaluation();

  let resolved = 0;
  let stillPending = 0;

  for (const decision of due) {
    const since = decision.applied_at ?? decision.created_at;
    const evidence = decision.evidence as unknown as Signal[];

    // A decision with no affected items (a "keep"/"call" decision, or an
    // "adjust" decision never actually applied via the Program Builder
    // banner) made no program change to re-check — evaluateOutcome's own
    // per-signal filter (`affectedItemIds.includes(signal.programItemId)`)
    // then finds nothing to evaluate and correctly falls through to
    // not_evaluable on the very first run, which is the right call: there
    // is nothing here that WILL ever become checkable.
    const [{ data: postResults, error: resultsError }, { data: postLogs, error: logsError }] = await Promise.all([
      decision.affected_item_ids.length === 0
        ? Promise.resolve({ data: [] as ResultRow[], error: null })
        : supabase
            .from("workout_exercise_results")
            .select("program_item_id, session_id, pain, created_at")
            .eq("client_id", decision.client_id)
            .in("program_item_id", decision.affected_item_ids)
            .gte("created_at", since),
      decision.affected_item_ids.length === 0
        ? Promise.resolve({ data: [] as SetLogRow[], error: null })
        : supabase
            .from("workout_set_logs")
            .select("program_item_id, session_id, reps, prescribed_reps, completed_at")
            .eq("client_id", decision.client_id)
            .in("program_item_id", decision.affected_item_ids)
            .gte("completed_at", since),
    ]);
    if (resultsError || logsError) continue; // one bad decision shouldn't stop the sweep

    const result = evaluateOutcome(
      { affectedItemIds: decision.affected_item_ids, evidence, since },
      postResults ?? [],
      postLogs ?? [],
      now
    );
    if (result == null) {
      stillPending++;
      continue;
    }

    // recordOutcome's update triggers notify_on_decision_outcome
    // (20260925000001_coaching_decisions.sql) once outcome_status leaves
    // 'pending' — both the client and the coach get notified from there,
    // nothing further to do in this route.
    await ledger.recordOutcome(decision.id, result);
    resolved++;
  }

  return NextResponse.json({ due: due.length, resolved, stillPending });
}
