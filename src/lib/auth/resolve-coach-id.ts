import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Resolves the tenant coach_id for the currently authenticated user,
 * whether they're the original tenant owner (a coaches row with their own
 * id) or an accepted team member (mapped via team_members). Mirrors
 * private.coach_id()'s resolution on the DB side -- see
 * supabase/migrations/20260824000001_team_members.sql. Needed anywhere
 * application code currently assumes `user.id` IS the coach's tenant id for
 * an explicit query filter (RLS itself doesn't need this -- it already goes
 * through the updated DB-side function -- but code doing e.g.
 * `.eq("coach_id", user!.id)` explicitly would silently return nothing, or
 * the wrong thing, for a team member without this). */
export async function resolveCoachId(supabase: SupabaseClient<Database>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: coach } = await supabase.from("coaches").select("id").eq("id", user.id).maybeSingle();
  if (coach) {
    // Mirrors private.coach_id()'s owner branch, which requires role =
    // 'coach' alongside the coaches row -- see
    // supabase/migrations/20260824000001_team_members.sql.
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role === "coach") return coach.id;
  }

  const { data: membership } = await supabase
    .from("team_members")
    .select("coach_id")
    .eq("profile_id", user.id)
    .not("accepted_at", "is", null)
    .maybeSingle();
  return membership?.coach_id ?? null;
}
