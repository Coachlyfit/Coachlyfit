"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { FeedbackService } from "@/domain/feedback/feedback.service";

// No revalidatePath -- nothing on the coach's own screen reflects this
// write back (see FeedbackService's write-only-for-coaches note). Mirrors
// sendMessageAction's trim+length-check shape in
// src/domain/messages/messages-actions.ts.
export async function submitFeedbackAction(body: string): Promise<{ error: string } | void> {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 1000) return { error: "invalid_input" };

  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  await new FeedbackService(supabase).create(coachId, trimmed);
}
