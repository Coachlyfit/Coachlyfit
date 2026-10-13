/** Support tickets: the values and limits shared by the server actions, the
 * forms and the database (20261024000001_support_tickets.sql). The numbers
 * here mirror that migration's checks and bucket limits; the database is the
 * one that enforces them. */

export const TICKET_CATEGORIES = ["technical", "billing", "feature_request", "other"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_STATUSES = ["open", "in_progress", "waiting_on_coach", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 150;
export const BODY_MAX = 5000;

export const SUPPORT_BUCKET = "support-attachments";
export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_MB = 5;
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;
export const ATTACHMENT_EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type AttachmentMime = keyof typeof ATTACHMENT_EXT_BY_MIME;

export function isAttachmentMime(mime: string): mime is AttachmentMime {
  return mime in ATTACHMENT_EXT_BY_MIME;
}

/** A closed ticket can be reopened by its owner for this long (see
 * support_reopen_ticket). */
export const REOPEN_WINDOW_DAYS = 14;

/** Where a message's files live: `coach/ticket/message/`. The folder is the
 * ticket owner's for both sides, so an admin's reply attachments are readable
 * by the coach. */
export function attachmentFolder(coachId: string, ticketId: string, messageId: string): string {
  return `${coachId}/${ticketId}/${messageId}/`;
}

/** True when every path sits directly in the message's own folder. The
 * database checks the prefix again (ticket_messages_guard). */
export function attachmentsBelongTo(paths: string[], folder: string): boolean {
  return paths.every((path) => path.startsWith(folder) && !path.slice(folder.length).includes("/"));
}

export function canReopen(ticket: { status: string; closed_at: string | null }, now: Date): boolean {
  if (ticket.status !== "closed" || !ticket.closed_at) return false;
  const windowMs = REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - new Date(ticket.closed_at).getTime() < windowMs;
}
