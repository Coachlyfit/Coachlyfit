export type MessageStatus = "sending" | "failed" | "sent" | "read";

/** Own-message tick state. There's no delivery ack in this schema (only
 * read_at), so "sent" covers both sent-and-unread and delivered — inventing
 * a distinct "delivered" state would claim a guarantee the backend can't
 * actually prove. */
export function getMessageStatus(input: { isOwn: boolean; readAt: string | null; pendingStatus?: "sending" | "failed" }): MessageStatus | null {
  if (!input.isOwn) return null;
  if (input.pendingStatus) return input.pendingStatus;
  return input.readAt ? "read" : "sent";
}
