"use server";

import { createClient } from "@/lib/supabase/server";
import { LedgerService } from "@/domain/ledger/ledger.service";

/** Fire-and-forget read receipt for the client home's Coach Decision card —
 * same shape as review/actions.ts's markCheckinSeenAction: called from a
 * client component's useEffect on mount, no loading state, and failures
 * are swallowed since a missed read receipt isn't worth surfacing as an
 * error to the client. */
export async function markDecisionSeenAction(decisionId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  try {
    await new LedgerService(supabase).markSeen(decisionId);
  } catch (error) {
    console.error("markDecisionSeenAction failed", error);
  }
}
