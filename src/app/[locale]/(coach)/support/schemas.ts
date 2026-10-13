import { z } from "zod";
import {
  BODY_MAX,
  MAX_ATTACHMENTS,
  SUBJECT_MAX,
  SUBJECT_MIN,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
} from "@/domain/support/support";

// Shared with the admin's actions (admin/support/actions.ts): both sides
// write the same kind of message.

const attachmentPaths = z.array(z.string().min(1).max(300)).max(MAX_ATTACHMENTS);
const body = z.string().trim().min(1).max(BODY_MAX);

/** What the new-ticket form holds. */
export const ticketFormSchema = z.object({
  subject: z.string().trim().min(SUBJECT_MIN).max(SUBJECT_MAX),
  category: z.enum(TICKET_CATEGORIES),
  body,
});
export type TicketFormInput = z.infer<typeof ticketFormSchema>;

/** The form plus the ids the files were uploaded under. */
export const newTicketSchema = ticketFormSchema.extend({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
  attachmentPaths,
});

export const replySchema = z.object({
  ticketId: z.string().uuid(),
  id: z.string().uuid(),
  body,
  attachmentPaths,
  internal: z.boolean().optional(),
});

export const ticketIdSchema = z.string().uuid();
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
