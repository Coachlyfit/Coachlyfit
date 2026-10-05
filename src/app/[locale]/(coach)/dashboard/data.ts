import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { CoachHomeService } from "@/domain/dashboard/coach-home.service";

/** The header's task total and the attention cards read the same four
 * counts; React.cache makes that one round of queries per request instead of
 * two (same reasoning as src/lib/auth/session.ts). */
export const getAttentionCounts = cache(async () => {
  const supabase = await createClient();
  return new CoachHomeService(supabase).attentionCounts(new Date());
});
