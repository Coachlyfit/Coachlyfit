"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { TeamService } from "@/domain/team/team.service";

type InviteResult = { error: string } | { token: string };
type ActionResult = { error: string } | void;

const inviteSchema = z.object({
  email: z.string().email(),
});

// Returns the plaintext token (not a full join URL, unlike
// createClientInviteAction's joinUrl) -- the caller builds the shareable
// link client-side, since TeamCard needs the raw token to show it once and
// there's nothing server-only about the URL shape here.
export async function inviteTeamMemberAction(locale: string, formData: FormData): Promise<InviteResult> {
  const parsed = inviteSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  const { token } = await new TeamService(supabase).invite(coachId, parsed.data.email);
  revalidatePath(`/${locale}/settings`);
  return { token };
}

// Relies on the coach_rw RLS policy on team_members to scope the delete to
// the caller's own tenant -- same trust model as deleteObservationAction /
// deleteMetricDefinitionAction.
export async function removeTeamMemberAction(locale: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  const ok = await new TeamService(supabase).remove(id);
  if (!ok) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/settings`);
}
