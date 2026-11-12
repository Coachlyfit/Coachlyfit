import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getRequestCoachId } from "./session";

/** Collapses the "getUser() -> resolveCoachId() -> bail if either is null"
 * preamble repeated at the top of most coach-side server actions into one
 * call. Not load-bearing for authorization by itself (RLS is still what
 * actually scopes every query) — this exists so an anonymous or
 * unauthenticated caller gets a real error code instead of the action
 * silently reaching a query that returns zero rows, same reasoning as
 * every other action's own auth re-check (see programs/actions.ts's header
 * comment). Adopt incrementally in new/touched actions rather than as a
 * repo-wide rewrite. */
export async function requireCoach(): Promise<
  | { error: "not_authenticated" }
  | { supabase: SupabaseClient<Database>; coachId: string }
> {
  const supabase = await createClient();
  const coachId = await getRequestCoachId();
  if (!coachId) return { error: "not_authenticated" };
  return { supabase, coachId };
}

/** Same as requireCoach but also checks the caller is the tenant owner
 * (not a team member). Use for actions that mutate coach-level / tenant
 * config (settings, billing, branding) where members must be blocked.
 * RLS is still the real gate; this gives a clean error code instead. */
export async function requireOwner(): Promise<
  | { error: "not_authenticated" | "owner_only" }
  | { supabase: SupabaseClient<Database>; coachId: string }
> {
  const supabase = await createClient();
  const [user, coachId] = await Promise.all([getAuthUser(), getRequestCoachId()]);
  if (!user || !coachId) return { error: "not_authenticated" };
  if (user.id !== coachId) return { error: "owner_only" };
  return { supabase, coachId };
}
