"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { AlternativesService, type AlternativeExercise } from "./alternatives.service";

// Plain RLS-scoped reads for the coach editors. Live in src/domain (like
// library-actions.ts) so components don't import a route's write actions.

const uuid = z.string().uuid();

/** The coach's own alternatives for an exercise (what the library form edits). */
export async function listOwnAlternativesAction(exerciseId: string): Promise<AlternativeExercise[]> {
  if (!uuid.safeParse(exerciseId).success) return [];
  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return [];
  return new AlternativesService(supabase).listOwnLibrary(coachId, exerciseId);
}

/** Program-builder view of one item: the inherited library list and the
 * item's own override (empty override = inheriting). */
export async function getItemAlternativesAction(
  programItemId: string,
  exerciseId: string
): Promise<{ inherited: AlternativeExercise[]; override: AlternativeExercise[] }> {
  if (!uuid.safeParse(programItemId).success || !uuid.safeParse(exerciseId).success) {
    return { inherited: [], override: [] };
  }
  const service = new AlternativesService(await createClient());
  const [inherited, override] = await Promise.all([service.listLibrary(exerciseId), service.listOverride(programItemId)]);
  return { inherited, override };
}

/** Library list for an exercise as the caller sees it, for a NEW program
 * item that has no id yet (add-exercise dialog preview). */
export async function listLibraryAlternativesAction(exerciseId: string): Promise<AlternativeExercise[]> {
  if (!uuid.safeParse(exerciseId).success) return [];
  return new AlternativesService(await createClient()).listLibrary(exerciseId);
}
