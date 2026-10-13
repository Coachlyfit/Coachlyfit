"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getViewerProfile } from "@/lib/auth/session";
import { SupportService } from "./support.service";

// Used by components shared by the coach and admin sides (the nav badge, the
// ticket page), so the side is read from the session here, never taken as an
// argument. RLS decides what either side can actually count or mark.

/** Unread tickets for the nav badge. Zero for anyone who isn't an admin or a
 * coach, and for a team member (RLS shows them no tickets). */
export async function supportUnreadCountAction(): Promise<number> {
  const profile = await getViewerProfile();
  if (profile?.role !== "admin" && profile?.role !== "coach") return 0;
  try {
    return await new SupportService(await createClient()).unreadCount(profile.role);
  } catch {
    return 0;
  }
}

export async function markTicketReadAction(ticketId: string): Promise<void> {
  if (!z.string().uuid().safeParse(ticketId).success) return;
  try {
    await new SupportService(await createClient()).markRead(ticketId);
  } catch {
    // Best effort: the badge just stays until the next visit.
  }
}
