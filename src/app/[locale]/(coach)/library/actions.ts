"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { LibraryService, type LibraryQuery } from "@/domain/library/library.service";
import { libraryErrorKey } from "@/domain/library/errors";
import { createExerciseSchema, createFoodSchema } from "./schemas";

type ActionResult = { error: string } | void;

// The form is one cue per line (a plain textarea, not a dynamic list UI);
// exercises.cues_ar/cues_en are text[] — this is the one place that shape
// changes, so both createExerciseAction and updateExerciseAction go through
// it rather than each re-deriving the split/trim/filter rules.
export function linesToArray(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : undefined;
}

export async function searchExercisesAction(params: LibraryQuery = {}) {
  const supabase = await createClient();
  return new LibraryService(supabase).searchExercises(params);
}

export async function searchFoodsAction(params: LibraryQuery = {}) {
  const supabase = await createClient();
  return new LibraryService(supabase).searchFoods(params);
}

// Read-only, same as the search actions above — RLS is the guard. Used by
// "Edit my version": the card only has my_clone_id, not the clone's fields.
export async function getExerciseAction(id: string) {
  const supabase = await createClient();
  return new LibraryService(supabase).getExercise(id);
}

export async function getFoodAction(id: string) {
  const supabase = await createClient();
  return new LibraryService(supabase).getFood(id);
}

export async function createExerciseAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = createExerciseSchema.safeParse({
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
    muscle_group: formData.get("muscle_group") || undefined,
    equipment: formData.get("equipment") || undefined,
    video_url: formData.get("video_url") || undefined,
    image_url: formData.get("image_url") || undefined,
    instructions_ar: formData.get("instructions_ar") || undefined,
    instructions_en: formData.get("instructions_en") || undefined,
    cues_ar: formData.get("cues_ar") || undefined,
    cues_en: formData.get("cues_en") || undefined,
    coach_notes_ar: formData.get("coach_notes_ar") || undefined,
    coach_notes_en: formData.get("coach_notes_en") || undefined,
    // Present only on the clone flow — the dialog hides this field entirely
    // for a plain "Add exercise".
    source_exercise_id: formData.get("source_exercise_id") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { video_url, image_url, cues_ar, cues_en, ...input } = parsed.data;
  try {
    await new LibraryService(supabase).createExercise(user.id, {
      ...input,
      video_url: video_url || undefined,
      image_url: image_url || undefined,
      cues_ar: linesToArray(cues_ar),
      cues_en: linesToArray(cues_en),
    });
  } catch (error) {
    // 23505 here means the coach already has a clone of this global — see
    // exercises_coach_source_uniq (20260805000001_library_clone.sql).
    return { error: libraryErrorKey(error) };
  }
  revalidatePath(`/${locale}/library`);
}

export async function createFoodAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = createFoodSchema.safeParse({
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
    serving_label: formData.get("serving_label"),
    category: formData.get("category"),
    kcal: formData.get("kcal"),
    protein_g: formData.get("protein_g") || 0,
    carb_g: formData.get("carb_g") || 0,
    fat_g: formData.get("fat_g") || 0,
    notes_ar: formData.get("notes_ar") || undefined,
    notes_en: formData.get("notes_en") || undefined,
    source_food_id: formData.get("source_food_id") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    await new LibraryService(supabase).createFood(user.id, parsed.data);
  } catch (error) {
    return { error: libraryErrorKey(error) };
  }
  revalidatePath(`/${locale}/library`);
}

// Mirrors deleteExerciseAction/deleteFoodAction below: RLS's update_own
// policy is the real authorization boundary (a coach editing a global or
// another coach's row simply matches 0 rows), this just turns that no-op
// into a message and re-checks auth since actions don't inherit the (coach)
// layout guard.
export async function updateExerciseAction(
  locale: string,
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = createExerciseSchema.safeParse({
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
    muscle_group: formData.get("muscle_group") || undefined,
    equipment: formData.get("equipment") || undefined,
    video_url: formData.get("video_url") || undefined,
    image_url: formData.get("image_url") || undefined,
    instructions_ar: formData.get("instructions_ar") || undefined,
    instructions_en: formData.get("instructions_en") || undefined,
    cues_ar: formData.get("cues_ar") || undefined,
    cues_en: formData.get("cues_en") || undefined,
    coach_notes_ar: formData.get("coach_notes_ar") || undefined,
    coach_notes_en: formData.get("coach_notes_en") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { video_url, image_url, cues_ar, cues_en, ...input } = parsed.data;
  try {
    const updated = await new LibraryService(supabase).updateExercise(id, {
      ...input,
      video_url: video_url || undefined,
      image_url: image_url || undefined,
      cues_ar: linesToArray(cues_ar),
      cues_en: linesToArray(cues_en),
    });
    if (!updated) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: libraryErrorKey(error) };
  }
  revalidatePath(`/${locale}/library`);
}

export async function updateFoodAction(locale: string, id: string, formData: FormData): Promise<ActionResult> {
  const parsed = createFoodSchema.safeParse({
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
    serving_label: formData.get("serving_label"),
    category: formData.get("category"),
    kcal: formData.get("kcal"),
    protein_g: formData.get("protein_g") || 0,
    carb_g: formData.get("carb_g") || 0,
    fat_g: formData.get("fat_g") || 0,
    notes_ar: formData.get("notes_ar") || undefined,
    notes_en: formData.get("notes_en") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    const updated = await new LibraryService(supabase).updateFood(id, parsed.data);
    if (!updated) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: libraryErrorKey(error) };
  }
  revalidatePath(`/${locale}/library`);
}

// Server actions are individually addressable POST endpoints — they do NOT
// inherit the (coach) layout's guard, so each write re-checks auth itself.
// RLS is still the authority on WHICH rows; this only rejects anonymous
// callers early and turns an RLS no-op into a message instead of a lie.
export async function deleteExerciseAction(locale: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    const deleted = await new LibraryService(supabase).deleteExercise(id);
    if (!deleted) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: libraryErrorKey(error) };
  }
  revalidatePath(`/${locale}/library`);
}

export async function deleteFoodAction(locale: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    const deleted = await new LibraryService(supabase).deleteFood(id);
    if (!deleted) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: libraryErrorKey(error) };
  }
  revalidatePath(`/${locale}/library`);
}

export async function moveExerciseAction(
  locale: string,
  id: string,
  muscleGroup: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    const moved = await new LibraryService(supabase).updateExerciseGroup(id, muscleGroup);
    if (!moved) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: libraryErrorKey(error) };
  }
  revalidatePath(`/${locale}/library`);
}

export async function moveFoodAction(
  locale: string,
  id: string,
  category: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    const moved = await new LibraryService(supabase).updateFoodCategory(id, category);
    if (!moved) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: libraryErrorKey(error) };
  }
  revalidatePath(`/${locale}/library`);
}
