import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "./resolve-coach-id";
import type { Database } from "@/lib/supabase/database.types";

/** Request-scoped (React.cache), auth-and-tenant helpers.
 *
 * Every coach/client/admin layout, plus most pages and Server Actions
 * underneath them, independently re-derived "who is this user, what's
 * their role, what's their coach_id" from scratch -- each via its own
 * `auth.getUser()` network round-trip and its own serial DB queries. On a
 * single navigation that preamble ran 3-4 times before the page's own data
 * even started loading (proxy -> layout -> resolveCoachId -> page), and
 * ran again on every Server Action + the revalidatePath re-render that
 * follows it. None of those calls' answers change within one request, so
 * this wraps them in React.cache to fetch each at most once per request and
 * share the result across every caller (layout, page, and any Server
 * Component in between) in that render.
 *
 * NOT a caching layer across requests or users -- React.cache's dedupe
 * window is exactly one server render/request. RLS remains the actual
 * authorization boundary; this only avoids repeating reads whose answer
 * cannot change mid-request. */

/** The authenticated user for this request, or null. Uses getUser() (not
 * getSession()) so it's still validated against the Auth server -- same
 * reasoning as every call site this replaces -- but now that validation
 * happens once per request instead of once per call site. */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** role/full_name/suspended_at for the current user, or null if
 * unauthenticated or the profile row is missing. */
export const getViewerProfile = cache(async () => {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, suspended_at")
    .eq("id", user.id)
    .maybeSingle();
  return profile;
});

/** Tenant coach_id for the current user (see resolveCoachId's own doc for
 * owner vs. team-member resolution). */
export const getRequestCoachId = cache(async () => {
  const supabase = await createClient();
  return resolveCoachId(supabase as SupabaseClient<Database>);
});
