"use server";

import { revalidatePath } from "next/cache";
import { LibraryService, type LibraryQuery, type LibraryPage } from "@/domain/library/library.service";
import { libraryErrorKey } from "@/domain/library/errors";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createExerciseSchema, createFoodSchema } from "@/app/[locale]/(coach)/library/schemas";
import { linesToArray } from "@/app/[locale]/(coach)/library/lines-to-array";

type ActionResult = { error: string } | void;

function emptyPage(params: LibraryQuery): LibraryPage<never> {
  return { rows: [], total: 0, page: params.page ?? 1, pageSize: params.pageSize ?? 24 };
}

export async function adminSearchExercisesAction(params: LibraryQuery = {}) {
  const { supabase, error } = await requireAdmin();
  // Read-only and consumed by react-query, so it returns an empty page
  // rather than an error shape; a non-admin can't reach the page anyway.
  if (error || !supabase) return emptyPage(params);
  return new LibraryService(supabase).searchExercises(params);
}

export async function adminSearchFoodsAction(params: LibraryQuery = {}) {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return emptyPage(params);
  return new LibraryService(supabase).searchFoods(params);
}

const EXERCISE_FIELDS = [
  "name_ar", "name_en", "muscle_group", "equipment", "video_url", "image_url",
  "instructions_ar", "instructions_en", "cues_ar", "cues_en", "steps_ar", "steps_en",
  "mistakes_ar", "mistakes_en", "safety_ar", "safety_en", "tempo", "primary_muscles",
  "secondary_muscles", "difficulty", "thumbnail_url", "video_url_alt",
] as const;

// Same fields as the coach form, minus coach_notes (a global has no owning
// coach) and source_exercise_id (provenance is a clone-flow concern).
function parseExercise(formData: FormData) {
  const parsed = createExerciseSchema.safeParse(
    Object.fromEntries(EXERCISE_FIELDS.map((f) => [f, formData.get(f) || undefined]))
  );
  if (!parsed.success) return null;
  const {
    video_url, image_url, thumbnail_url, video_url_alt, cues_ar, cues_en, steps_ar, steps_en,
    mistakes_ar, mistakes_en, primary_muscles, secondary_muscles, ...input
  } = parsed.data;
  return {
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
  };
}

function parseFood(formData: FormData) {
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
  return parsed.success ? parsed.data : null;
}

// Globals are what every coach sees, so any admin write also stales the
// coach page.
function revalidateLibrary(locale: string) {
  revalidatePath(`/${locale}/admin/library`);
  revalidatePath(`/${locale}/library`);
}

export async function createGlobalExerciseAction(
  locale: string,
  formData: FormData
): Promise<ActionResult> {
  const input = parseExercise(formData);
  if (!input) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new LibraryService(supabase).createGlobalExercise(input);
  } catch (err) {
    return { error: libraryErrorKey(err) };
  }
  revalidateLibrary(locale);
}

export async function createGlobalFoodAction(
  locale: string,
  formData: FormData
): Promise<ActionResult> {
  const input = parseFood(formData);
  if (!input) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new LibraryService(supabase).createGlobalFood(input);
  } catch (err) {
    return { error: libraryErrorKey(err) };
  }
  revalidateLibrary(locale);
}

export async function updateGlobalExerciseAction(
  locale: string,
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const input = parseExercise(formData);
  if (!input) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    // admin_update_global is qualified `coach_id is null`, so an attempt to
    // edit a coach's private row matches 0 rows and lands here as false.
    const updated = await new LibraryService(supabase).updateExercise(id, input);
    if (!updated) return { error: "not_found_or_forbidden" };
  } catch (err) {
    return { error: libraryErrorKey(err) };
  }
  revalidateLibrary(locale);
}

export async function updateGlobalFoodAction(
  locale: string,
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const input = parseFood(formData);
  if (!input) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    const updated = await new LibraryService(supabase).updateFood(id, input);
    if (!updated) return { error: "not_found_or_forbidden" };
  } catch (err) {
    return { error: libraryErrorKey(err) };
  }
  revalidateLibrary(locale);
}

// Soft delete, same as the coach side: restorable from the trash dialog.
export async function deleteGlobalExerciseAction(locale: string, id: string): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    const archived = await new LibraryService(supabase).archiveExercise(id);
    if (!archived) return { error: "not_found_or_forbidden" };
  } catch (err) {
    return { error: libraryErrorKey(err) };
  }
  revalidateLibrary(locale);
}

export async function restoreGlobalExerciseAction(locale: string, id: string): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const restored = await new LibraryService(supabase).restoreExercise(id);
  if (!restored) return { error: "not_found_or_forbidden" };
  revalidateLibrary(locale);
}

export async function listArchivedGlobalExercisesAction() {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return [];
  return new LibraryService(supabase).listArchivedExercises();
}

export async function deleteGlobalFoodAction(locale: string, id: string): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    const deleted = await new LibraryService(supabase).deleteFood(id);
    if (!deleted) return { error: "not_found_or_forbidden" };
  } catch (err) {
    return { error: libraryErrorKey(err) };
  }
  revalidateLibrary(locale);
}

export async function promoteExerciseAction(locale: string, id: string): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new LibraryService(supabase).promoteExercise(id);
  } catch (err) {
    return { error: libraryErrorKey(err) };
  }
  revalidateLibrary(locale);
}

export async function promoteFoodAction(locale: string, id: string): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new LibraryService(supabase).promoteFood(id);
  } catch (err) {
    return { error: libraryErrorKey(err) };
  }
  revalidateLibrary(locale);
}
