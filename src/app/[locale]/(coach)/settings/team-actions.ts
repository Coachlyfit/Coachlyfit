"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { getAuthUser } from "@/lib/auth/session";
import { TeamService } from "@/domain/team/team.service";

type InviteResult = { error: string } | { token: string };
type ActionResult = { error: string } | void;

const inviteSchema = z.object({
  email: z.string().email(),
});

// Only the tenant owner manages the team. The owner_insert / owner_delete
// policies on team_members (20261020000001) are the boundary; this turns
// their bare 42501 into a message a team member can read.
async function requireOwner() {
  const supabase = await createClient();
  const [user, coachId] = await Promise.all([getAuthUser(), resolveCoachId(supabase)]);
  if (!user || !coachId) return { error: "not_authenticated" } as const;
  if (user.id !== coachId) return { error: "owner_only" } as const;
  return { supabase, coachId };
}

// private.enforce_team_cap() raises with one of these hints: the plan's seat
// cap is reached, or the subscription has lapsed. Anything else is a real
// failure and keeps throwing.
function seatError(error: unknown): string | null {
  const hint = (error as { hint?: string } | null)?.hint;
  return hint === "team_limit_reached" || hint === "subscription_inactive" ? hint : null;
}

// Returns the plaintext token (not a full join URL, unlike
// createClientInviteAction's joinUrl) -- the caller builds the shareable
// link client-side, since TeamCard needs the raw token to show it once and
// there's nothing server-only about the URL shape here.
export async function inviteTeamMemberAction(locale: string, formData: FormData): Promise<InviteResult> {
  const parsed = inviteSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "invalid_input" };

  const owner = await requireOwner();
  if (owner.error) return { error: owner.error };

  try {
    const { token } = await new TeamService(owner.supabase).invite(owner.coachId, parsed.data.email);
    revalidatePath(`/${locale}/settings/account`);
    return { token };
  } catch (error) {
    const code = seatError(error);
    if (!code) throw error;
    return { error: code };
  }
}

export async function removeTeamMemberAction(locale: string, id: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (owner.error) return { error: owner.error };

  const ok = await new TeamService(owner.supabase).remove(id);
  if (!ok) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/settings/account`);
}
