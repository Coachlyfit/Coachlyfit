"use server";

import { z } from "zod";
import { requireCoach } from "@/lib/auth/require-coach";
import { FeedbackService } from "@/domain/feedback/feedback.service";

const feedbackSchema = z
  .string()
  .trim()
  .min(1)
  .max(1000);

// No revalidatePath -- nothing on the coach's own screen reflects this
// write back (see FeedbackService's write-only-for-coaches note).
export async function submitFeedbackAction(body: string): Promise<{ error: string } | void> {
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireCoach();
  if ("error" in auth) return auth;

  await new FeedbackService(auth.supabase).create(auth.coachId, parsed.data);
}
