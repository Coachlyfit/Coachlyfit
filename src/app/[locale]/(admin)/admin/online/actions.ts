"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { routing } from "@/i18n/routing";
import { InvitesService, joinUrl } from "@/domain/clients/invites.service";
import { PresenceService, type CoachClientRow, type OnlineSummary } from "@/domain/presence/presence.service";

const idSchema = z.string().uuid();
const localeSchema = z.enum(routing.locales);

// requireAdmin() fails fast; the RPCs behind PresenceService and
// InvitesService re-check private.is_admin() and are the real boundary.

/** Read by useQuery on the "Online now" page, so failures throw (and land in
 * the query's error state) instead of returning an { error } object. */
export async function getOnlineSummaryAction(): Promise<OnlineSummary> {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) throw new Error(error ?? "forbidden");
  return new PresenceService(supabase).adminSummary();
}

export async function listCoachClientsAction(coachId: string): Promise<CoachClientRow[]> {
  const parsed = idSchema.safeParse(coachId);
  if (!parsed.success) throw new Error("invalid_input");
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) throw new Error(error ?? "forbidden");
  return new PresenceService(supabase).adminCoachClients(parsed.data);
}

/** New single-use join link for a client who has no account yet. Nothing is
 * sent anywhere: the admin copies the link and passes it on. */
export async function createInviteLinkAction(
  locale: string,
  clientId: string
): Promise<{ error: string } | { joinUrl: string }> {
  const parsed = z.object({ locale: localeSchema, clientId: idSchema }).safeParse({ locale, clientId });
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    const { token, slug } = await new InvitesService(supabase).adminCreateInvite(parsed.data.clientId);
    return { joinUrl: joinUrl(parsed.data.locale, token, slug) };
  } catch {
    return { error: "invite_failed" };
  }
}
