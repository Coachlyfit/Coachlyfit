"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ReviewService } from "@/domain/progress/review.service";
import { MessagesService } from "@/domain/messages/messages.service";
import { reviewSchema } from "./schemas";

type ActionResult = { error: string } | void;

/** Clears one check-in from the review queue: records the coach's decision
 * (review_checkin RPC — see 20260804000001_checkin_review.sql for why a
 * raw update isn't used) and sends the reply through the existing
 * coach<->client message thread. In-app delivery only — there's no
 * WhatsApp gateway wired up in this codebase, so the reply lands wherever
 * every other coach message does, not as a separate channel. */
export async function submitReviewAction(locale: string, formData: FormData): Promise<ActionResult> {
  const adjustments = formData.getAll("adjustments").map(String);
  const parsed = reviewSchema.safeParse({
    checkinId: formData.get("checkinId"),
    decision: formData.get("decision"),
    adjustments: adjustments.length ? adjustments : undefined,
    coachReply: formData.get("coachReply"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

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

  await new MessagesService(supabase).send(user.id, checkin.client_id, {
    sender_role: "coach",
    body: parsed.data.coachReply,
  });

  revalidatePath(`/${locale}/review`);
  revalidatePath(`/${locale}/dashboard`);
}
