import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "./resolve-coach-id";

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
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };
  return { supabase, coachId };
}
