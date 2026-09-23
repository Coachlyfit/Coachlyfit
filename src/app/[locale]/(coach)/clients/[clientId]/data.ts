import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { ProgramsService } from "@/domain/programs/programs.service";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";

/** React `cache()` so the header, the attention strip, and the two plan
 * cards — each its own Suspense boundary, each rendered in the same request
 * — share one query per concern instead of re-fetching the same active
 * program/diet three times. Cleared automatically between requests; no
 * relation to Next's data cache. */
export const getActiveProgram = cache(async (clientId: string) => {
  const supabase = await createClient();
  return new ProgramsService(supabase).getActiveTreeForClient(clientId);
});

export const getActiveDiet = cache(async (clientId: string) => {
  const supabase = await createClient();
  return new DietPlansService(supabase).getActiveTreeForClient(clientId);
});
