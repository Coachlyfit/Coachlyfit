/** Feedback: the values and limits shared by the server action, the dialog and
 * the database (20261112000001_feedback_dialog.sql). The database enforces
 * them; these mirror its checks. Screenshot file types and size are the
 * support module's (same bucket limits). */

export const FEEDBACK_KINDS = ["bug", "feature", "rating"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export type FeedbackRole = "coach" | "client";

export const FEEDBACK_BODY_MAX = 1000;
export const RATING_MAX = 5;

export const FEEDBACK_BUCKET = "feedback-attachments";

/** Where a feedback's screenshot lives: `author/feedback/`. */
export function feedbackFolder(authorId: string, feedbackId: string): string {
  return `${authorId}/${feedbackId}/`;
}
