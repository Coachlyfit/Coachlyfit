"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { LibraryService, type LibraryQuery } from "@/domain/library/library.service";
import { libraryErrorKey } from "@/domain/library/errors";
import { createExerciseSchema, createFoodSchema } from "./schemas";

type ActionResult = { error: string } | void;

export async function searchExercisesAction(params: LibraryQuery = {}) {
  const supabase = await createClient();
  return new LibraryService(supabase).searchExercises(params);
}

export async function searchFoodsAction(params: LibraryQuery = {}) {
  const supabase = await createClient();
  return new LibraryService(supabase).searchFoods(params);
}

export async function createExerciseAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = createExerciseSchema.safeParse({
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
    muscle_group: formData.get("muscle_group") || undefined,
    equipment: formData.get("equipment") || undefined,
    video_url: formData.get("video_url") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { video_url, ...input } = parsed.data;
  await new LibraryService(supabase).createExercise(user.id, {
    ...input,
    video_url: video_url || undefined,
  });
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
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  await new LibraryService(supabase).createFood(user.id, parsed.data);
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
