"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/auth/require-coach";
import { getAuthUser } from "@/lib/auth/session";
import { attachmentFolder, attachmentsBelongTo } from "@/domain/support/support";
import { SupportService } from "@/domain/support/support.service";
import { newTicketSchema, replySchema, ticketIdSchema } from "./schemas";

type ActionResult = { error: string } | void;

// Signed in as the tenant owner. The policies and functions on
// support_tickets (20261024000001) are the boundary -- owner only, own
// tickets only, no internal notes; this only answers early with a code the
// UI can show instead of a bare database refusal.
async function requireOwner() {
  const coach = await requireCoach();
  if ("error" in coach) return coach;
  const user = await getAuthUser();
  if (user?.id !== coach.coachId) return { error: "forbidden" as const };
  return coach;
}

function supportError(error: unknown): string {
  const { hint, code } = (error ?? {}) as { hint?: string; code?: string };
  if (hint === "ticket_closed" || hint === "invalid_attachment" || hint === "too_many_open" || hint === "reopen_not_allowed") {
    return hint;
  }
  // RLS or a function's own role check refused the write.
  if (code === "42501") return "forbidden";
  return "send_failed";
}

export async function createTicketAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = newTicketSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const coach = await requireOwner();
  if ("error" in coach) return { error: coach.error };

  const { id, messageId, attachmentPaths } = parsed.data;
  if (!attachmentsBelongTo(attachmentPaths, attachmentFolder(coach.coachId, id, messageId))) {
    return { error: "invalid_attachment" };
  }

  try {
    await new SupportService(coach.supabase).create(parsed.data);
  } catch (error) {
    return { error: supportError(error) };
  }
  revalidatePath(`/${locale}/support`);
}

export async function replyTicketAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success || parsed.data.internal) return { error: "invalid_input" };

  const coach = await requireOwner();
  if ("error" in coach) return { error: coach.error };

  const { ticketId, id, body, attachmentPaths } = parsed.data;
  if (!attachmentsBelongTo(attachmentPaths, attachmentFolder(coach.coachId, ticketId, id))) {
    return { error: "invalid_attachment" };
  }

  try {
    await new SupportService(coach.supabase).reply(ticketId, { id, body, attachmentPaths });
  } catch (error) {
    return { error: supportError(error) };
  }
  revalidatePath(`/${locale}/support`);
  revalidatePath(`/${locale}/support/${ticketId}`);
}

export async function reopenTicketAction(locale: string, ticketId: string): Promise<ActionResult> {
  if (!ticketIdSchema.safeParse(ticketId).success) return { error: "invalid_input" };

  const coach = await requireOwner();
  if ("error" in coach) return { error: coach.error };

  try {
    await new SupportService(coach.supabase).reopen(ticketId);
  } catch (error) {
    return { error: supportError(error) };
  }
  revalidatePath(`/${locale}/support`);
  revalidatePath(`/${locale}/support/${ticketId}`);
}
