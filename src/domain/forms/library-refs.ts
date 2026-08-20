import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type LibraryRefOption = { id: string; name_ar: string; name_en: string };

// Deliberately independent of domain/library/library.service.ts (which is
// under active development elsewhere) — exercise_ref/food_ref fields only
// ever need an id + bilingual name to populate a picker, so this reads the
// same tables directly rather than taking a dependency on that service's
// evolving API. RLS (read_own_and_global) already scopes the result to
// global + the caller's own entries.
export async function listExerciseOptions(db: SupabaseClient<Database>): Promise<LibraryRefOption[]> {
  const { data, error } = await db.from("exercises").select("id, name_ar, name_en").order("name_en");
  if (error) throw error;
  return data;
}

export async function listFoodOptions(db: SupabaseClient<Database>): Promise<LibraryRefOption[]> {
  const { data, error } = await db.from("foods").select("id, name_ar, name_en").order("name_en");
  if (error) throw error;
  return data;
}
