"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getRequestCoachId, getViewerProfile } from "@/lib/auth/session";
import { attachmentsBelongTo } from "@/domain/support/support";
import { FEEDBACK_BODY_MAX, RATING_MAX, feedbackFolder } from "@/domain/feedback/feedback";
import { FeedbackService } from "@/domain/feedback/feedback.service";

const common = {
  id: z.string().uuid(),
  screenshotPath: z.string().min(1).max(300).nullable(),
};
const body = z.string().trim().min(1).max(FEEDBACK_BODY_MAX);

// bug / feature need a description; a rating needs stars and may skip it.
const feedbackSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bug"), body, ...common }),
  z.object({ kind: z.literal("feature"), body, ...common }),
  z.object({
    kind: z.literal("rating"),
    rating: z.number().int().min(1).max(RATING_MAX),
    body: z.string().trim().max(FEEDBACK_BODY_MAX).optional(),
    ...common,
  }),
]);

function feedbackError(error: unknown): string {
  const { hint, code } = (error ?? {}) as { hint?: string; code?: string };
  if (hint === "too_many_today" || hint === "invalid_attachment") return hint;
  // RLS refused the insert (wrong role, or a spoofed author).
  if (code === "42501") return "forbidden";
  return "send_failed";
}

// Shared by the coach and client layouts, so the role is read from the
// session here, never taken as an argument. The insert policy and the guard
// trigger (20261112000001) are the boundary; this answers early with a code
// the UI can show. No revalidatePath: nothing on the sender's screen reflects
// this write back (feedback is write-only for them).
export async function submitFeedbackAction(input: unknown): Promise<{ error: string } | void> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const data = parsed.data;

  const user = await getAuthUser();
  const profile = await getViewerProfile();
  if (!user || !profile) return { error: "not_authenticated" };
  if (profile.role !== "coach" && profile.role !== "client") return { error: "forbidden" };

  const coachId = profile.role === "coach" ? await getRequestCoachId() : null;
  if (profile.role === "coach" && !coachId) return { error: "not_authenticated" };

  if (data.screenshotPath && !attachmentsBelongTo([data.screenshotPath], feedbackFolder(user.id, data.id))) {
    return { error: "invalid_attachment" };
  }

  try {
    await new FeedbackService(await createClient()).create({
      id: data.id,
      authorId: user.id,
      authorRole: profile.role,
      coachId,
      kind: data.kind,
      rating: data.kind === "rating" ? data.rating : null,
      body: data.body ?? null,
      screenshotPath: data.screenshotPath,
    });
  } catch (error) {
    return { error: feedbackError(error) };
  }
}
