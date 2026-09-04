"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { LibraryService } from "@/domain/library/library.service";
import { libraryErrorKey } from "@/domain/library/errors";
import { createExerciseSchema, createFoodSchema } from "./schemas";
import { linesToArray } from "./lines-to-array";

type ActionResult = { error: string } | void;

// Plain reads moved to src/domain/library/library-actions.ts so a
// client-facing component can import them without pulling in this route's
// write actions (see that file's header comment). Re-exported here so
// existing coach-side importers (library-client.tsx, exercise-card.tsx,
// exercise-dialog.tsx, programs' exercise-picker/exercise-sidebar) don't
// need to change their import path.
export {
  searchExercisesAction,
  searchFoodsAction,
  getExerciseAction,
  getFoodAction,
} from "@/domain/library/library-actions";

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
    steps_ar: formData.get("steps_ar") || undefined,
    steps_en: formData.get("steps_en") || undefined,
    mistakes_ar: formData.get("mistakes_ar") || undefined,
    mistakes_en: formData.get("mistakes_en") || undefined,
    safety_ar: formData.get("safety_ar") || undefined,
    safety_en: formData.get("safety_en") || undefined,
    tempo: formData.get("tempo") || undefined,
    primary_muscles: formData.get("primary_muscles") || undefined,
    secondary_muscles: formData.get("secondary_muscles") || undefined,
    difficulty: formData.get("difficulty") || undefined,
    thumbnail_url: formData.get("thumbnail_url") || undefined,
    video_url_alt: formData.get("video_url_alt") || undefined,
    // Present only on the clone flow — the dialog hides this field entirely
    // for a plain "Add exercise".
    source_exercise_id: formData.get("source_exercise_id") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  const {
    video_url,
    image_url,
    thumbnail_url,
    video_url_alt,
    cues_ar,
    cues_en,
    steps_ar,
    steps_en,
    mistakes_ar,
    mistakes_en,
    primary_muscles,
    secondary_muscles,
    ...input
  } = parsed.data;
  try {
    await new LibraryService(supabase).createExercise(coachId, {
      ...input,
      video_url: video_url || undefined,
      image_url: image_url || undefined,
      thumbnail_url: thumbnail_url || undefined,
      video_url_alt: video_url_alt || undefined,
      cues_ar: linesToArray(cues_ar),
      cues_en: linesToArray(cues_en),
      steps_ar: linesToArray(steps_ar),
      steps_en: linesToArray(steps_en),
      mistakes_ar: linesToArray(mistakes_ar),
      mistakes_en: linesToArray(mistakes_en),
      primary_muscles: linesToArray(primary_muscles),
      secondary_muscles: linesToArray(secondary_muscles),
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
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  try {
    await new LibraryService(supabase).createFood(coachId, parsed.data);
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
    steps_ar: formData.get("steps_ar") || undefined,
    steps_en: formData.get("steps_en") || undefined,
    mistakes_ar: formData.get("mistakes_ar") || undefined,
    mistakes_en: formData.get("mistakes_en") || undefined,
    safety_ar: formData.get("safety_ar") || undefined,
    safety_en: formData.get("safety_en") || undefined,
    tempo: formData.get("tempo") || undefined,
    primary_muscles: formData.get("primary_muscles") || undefined,
    secondary_muscles: formData.get("secondary_muscles") || undefined,
    difficulty: formData.get("difficulty") || undefined,
    thumbnail_url: formData.get("thumbnail_url") || undefined,
    video_url_alt: formData.get("video_url_alt") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const {
    video_url,
    image_url,
    thumbnail_url,
    video_url_alt,
    cues_ar,
    cues_en,
    steps_ar,
    steps_en,
    mistakes_ar,
    mistakes_en,
    primary_muscles,
    secondary_muscles,
    ...input
  } = parsed.data;
  try {
    const updated = await new LibraryService(supabase).updateExercise(id, {
      ...input,
      video_url: video_url || undefined,
      image_url: image_url || undefined,
      thumbnail_url: thumbnail_url || undefined,
      video_url_alt: video_url_alt || undefined,
      cues_ar: linesToArray(cues_ar),
      cues_en: linesToArray(cues_en),
      steps_ar: linesToArray(steps_ar),
      steps_en: linesToArray(steps_en),
      mistakes_ar: linesToArray(mistakes_ar),
      mistakes_en: linesToArray(mistakes_en),
      primary_muscles: linesToArray(primary_muscles),
      secondary_muscles: linesToArray(secondary_muscles),
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
// Soft delete: archives instead of removing, so it can be undone from the
// trash view. Hard delete only happens via the 30-day cron.
export async function deleteExerciseAction(locale: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    const archived = await new LibraryService(supabase).archiveExercise(id);
    if (!archived) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: libraryErrorKey(error) };
  }
  revalidatePath(`/${locale}/library`);
}

export async function restoreExerciseAction(locale: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const restored = await new LibraryService(supabase).restoreExercise(id);
  if (!restored) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/library`);
}

export async function listArchivedExercisesAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return new LibraryService(supabase).listArchivedExercises();
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
