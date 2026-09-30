"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { NutritionLogsService } from "@/domain/nutrition/nutrition-logs.service";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";
import { targetsSource } from "@/domain/nutrition/suggest-targets";
import { assignTargetsSchema, bodyProfileSchema } from "@/domain/nutrition/nutrition.schema";

type ActionResult = { error: string } | void;

// Server actions don't inherit the (coach) layout's guard, so each one
// re-checks auth; RLS (coach_rw on active clients) decides which rows.
async function coachClient() {
  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  return coachId ? supabase : null;
}

export async function saveClientBodyProfileAction(locale: string, clientId: string, input: unknown): Promise<ActionResult> {
  const parsed = bodyProfileSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await coachClient();
  if (!supabase) return { error: "not_authenticated" };

  await new NutritionLogsService(supabase).saveBodyProfile(clientId, parsed.data);
  revalidatePath(`/${locale}/clients/${clientId}`);
}

/** Writes targets onto the client's active diet plan. The suggestion is
 * recomputed here from stored data rather than trusted from the browser,
 * so "suggested" vs "suggested_edited" reflects what was actually
 * suggested; with no valid suggestion the targets are "manual". */
export async function assignClientTargetsAction(
  locale: string,
  clientId: string,
  dietPlanId: string,
  input: unknown
): Promise<ActionResult> {
  const parsed = assignTargetsSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await coachClient();
  if (!supabase) return { error: "not_authenticated" };

  const { input: suggestInput, result } = await new NutritionLogsService(supabase).suggestionFor(clientId, new Date());
  const assigned = {
    kcal: parsed.data.target_kcal,
    protein_g: parsed.data.target_protein_g,
    carb_g: parsed.data.target_carb_g,
    fat_g: parsed.data.target_fat_g,
  };

  const updated = await new DietPlansService(supabase).assignTargets(dietPlanId, {
    ...parsed.data,
    targets_source: result.ok ? targetsSource(result.targets, assigned) : "manual",
    targets_suggestion: result.ok
      ? { ...result.targets, bmr: result.bmr, tdee: result.tdee, inputs: suggestInput, warnings: result.warnings }
      : null,
  });
  if (!updated) return { error: "not_found_or_forbidden" };

  revalidatePath(`/${locale}/clients/${clientId}`);
  revalidatePath(`/${locale}/diets/${dietPlanId}`);
}
