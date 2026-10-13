"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { attachmentFolder, attachmentsBelongTo } from "@/domain/support/support";
import { SupportService } from "@/domain/support/support.service";
import { replySchema, ticketIdSchema, ticketStatusSchema } from "@/app/[locale]/(coach)/support/schemas";

type ActionResult = { error: string } | void;

// requireAdmin() fails fast; the admin_all policies on support_tickets and
// ticket_messages are the real boundary.

function revalidate(locale: string, ticketId: string) {
  revalidatePath(`/${locale}/admin/support`);
  revalidatePath(`/${locale}/admin/support/${ticketId}`);
}

/** A reply the coach sees, or with `internal` a note only admins see. */
export async function adminReplyAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const { ticketId, id, body, attachmentPaths, internal } = parsed.data;
  if (internal && attachmentPaths.length > 0) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const service = new SupportService(supabase);
  try {
    // Attachments go in the ticket owner's folder, so the owner comes from
    // the ticket, not from the form.
    const ticket = await service.get(ticketId);
    if (!ticket) return { error: "forbidden" };
    if (!attachmentsBelongTo(attachmentPaths, attachmentFolder(ticket.coach_id, ticketId, id))) {
      return { error: "invalid_attachment" };
    }
    await service.reply(ticketId, { id, body, attachmentPaths, internal });
  } catch (err) {
    return { error: (err as { hint?: string } | null)?.hint === "invalid_attachment" ? "invalid_attachment" : "send_failed" };
  }
  revalidate(locale, ticketId);
}

export async function setTicketStatusAction(locale: string, ticketId: string, status: string): Promise<ActionResult> {
  const parsed = ticketStatusSchema.safeParse(status);
  if (!parsed.success || !ticketIdSchema.safeParse(ticketId).success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    const ok = await new SupportService(supabase).setStatus(ticketId, parsed.data);
    if (!ok) return { error: "forbidden" };
  } catch {
    return { error: "send_failed" };
  }
  revalidate(locale, ticketId);
}
