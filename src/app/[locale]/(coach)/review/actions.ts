"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { ReviewService } from "@/domain/progress/review.service";
import { MessagesService } from "@/domain/messages/messages.service";
import { ProgramsService } from "@/domain/programs/programs.service";
import { LedgerService } from "@/domain/ledger/ledger.service";
import { reviewSchema } from "./schemas";

type ActionResult = { error: string } | void;

// `adjustments`/`evidence` are JSON-encoded arrays in one FormData field
// each — same pattern as parseSetsField in programs/actions.ts. A parse
// failure falls through as `undefined`; reviewSchema's shape check catches
// anything that doesn't fit from there.
function parseJsonField(formData: FormData, key: string): unknown {
  const raw = formData.get(key);
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Clears one check-in from the review queue: records the coach's decision
 * (review_checkin RPC — see 20260804000001_checkin_review.sql for why a
 * raw update isn't used), sends the reply through the existing
 * coach<->client message thread, and writes the same decision to the
 * Coaching Ledger (coaching_decisions) so it's visible to the client as
 * more than a chat message — see ledger.service.ts's createFromReview.
 * In-app delivery only for the reply — there's no WhatsApp gateway wired
 * up in this codebase, so it lands wherever every other coach message
 * does, not as a separate channel. */
export async function submitReviewAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse({
    checkinId: formData.get("checkinId"),
    decision: formData.get("decision"),
    adjustments: parseJsonField(formData, "adjustments"),
    coachReply: formData.get("coachReply"),
    reasonKey: formData.get("reasonKey"),
    clientNote: formData.get("clientNote") ?? undefined,
    evidence: parseJsonField(formData, "evidence"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  const review = new ReviewService(supabase);
  let checkin;
  try {
    checkin = await review.reviewCheckin(parsed.data.checkinId, {
      decision: parsed.data.decision,
      adjustments: parsed.data.adjustments,
      coachReply: parsed.data.coachReply,
    });
  } catch {
    return { error: "review_failed" };
  }

  await new MessagesService(supabase).send(coachId, checkin.client_id, {
    sender_role: "coach",
    body: parsed.data.coachReply,
  });

  // Best-effort: the active program may have changed/ended between the
  // check-in and the review, and the ledger decision is still worth
  // recording without one (programId is nullable on coaching_decisions).
  const activeTree = await new ProgramsService(supabase).getActiveTreeForClient(checkin.client_id);
  await new LedgerService(supabase).createFromReview({
    coachId,
    clientId: checkin.client_id,
    checkinId: parsed.data.checkinId,
    programId: activeTree?.id ?? null,
    decision: parsed.data.decision,
    reasonKey: parsed.data.reasonKey,
    clientNote: parsed.data.clientNote ?? null,
    adjustments: parsed.data.adjustments ?? [],
    evidence: parsed.data.evidence ?? [],
    affectedItemIds: [],
  });

  revalidatePath(`/${locale}/review`);
  revalidatePath(`/${locale}/dashboard`);
}

/** Fire-and-forget read receipt: called from a useEffect on mount in
 * ReviewEntryPanel, not from a form submit — no revalidatePath, since
 * `coach_seen_at` isn't rendered anywhere on this page, and failures are
 * swallowed since a missed read receipt isn't worth surfacing as an error. */
export async function markCheckinSeenAction(checkinId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  try {
    await new ReviewService(supabase).markSeen(checkinId);
  } catch (error) {
    console.error("markCheckinSeenAction failed", error);
  }
}
