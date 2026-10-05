"use server";

import { createClient } from "@/lib/supabase/server";
import { LibraryService, type LibraryQuery } from "./library.service";

// Plain RLS-scoped reads (LibraryService.searchExercises/searchFoods
// already need only the caller's own session -- no coachId resolution, no
// mutation). Lives in src/domain rather than under (coach)/library/actions
// so a client-facing component (e.g. exercise-swap-sheet.tsx) can import a
// read without pulling in that route's write actions -- "exercises.
// read_own_and_global" already includes clients via private.tenant_id(),
// so the read itself is valid for both roles; this only fixes where the
// import comes from.
export async function searchExercisesAction(params: LibraryQuery = {}) {
  const supabase = await createClient();
  return new LibraryService(supabase).searchExercises(params);
}

export async function searchFoodsAction(params: LibraryQuery = {}) {
  const supabase = await createClient();
  return new LibraryService(supabase).searchFoods(params);
}

export async function exerciseFacetsAction(params: Pick<LibraryQuery, "query" | "source" | "equipment"> = {}) {
  const supabase = await createClient();
  return new LibraryService(supabase).exerciseFacets(params);
}

export async function foodFacetsAction(params: Pick<LibraryQuery, "query" | "source"> = {}) {
  const supabase = await createClient();
  return new LibraryService(supabase).foodFacets(params);
}

export async function getExerciseAction(id: string) {
  const supabase = await createClient();
  return new LibraryService(supabase).getExercise(id);
}

export async function getFoodAction(id: string) {
  const supabase = await createClient();
  return new LibraryService(supabase).getFood(id);
}
