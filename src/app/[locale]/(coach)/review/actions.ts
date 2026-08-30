"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { ReviewService } from "@/domain/progress/review.service";
import { MessagesService } from "@/domain/messages/messages.service";
import { reviewSchema } from "./schemas";

type ActionResult = { error: string } | void;

// `adjustments` is a JSON-encoded StructuredAdjustment[] in one FormData
// field — same pattern as parseSetsField in programs/actions.ts. A parse
// failure falls through as `undefined`; reviewSchema's shape check catches
// anything that doesn't fit from there.
function parseAdjustmentsField(formData: FormData): unknown {
  const raw = formData.get("adjustments");
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Clears one check-in from the review queue: records the coach's decision
 * (review_checkin RPC — see 20260804000001_checkin_review.sql for why a
 * raw update isn't used) and sends the reply through the existing
 * coach<->client message thread. In-app delivery only — there's no
 * WhatsApp gateway wired up in this codebase, so the reply lands wherever
 * every other coach message does, not as a separate channel. */
export async function submitReviewAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse({
    checkinId: formData.get("checkinId"),
    decision: formData.get("decision"),
    adjustments: parseAdjustmentsField(formData),
    coachReply: formData.get("coachReply"),
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
