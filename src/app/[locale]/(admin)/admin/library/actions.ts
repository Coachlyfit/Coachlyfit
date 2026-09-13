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

export async function createGlobalExerciseAction(
  locale: string,
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
  });
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  // steps_ar/en, mistakes_ar/en, primary_muscles/secondary_muscles are
  // text[] on the service/DB side but the shared coach-side zod schema
  // types them as a raw textarea string (line-per-item, converted via
  // linesToArray at the coach action boundary) -- this admin form never
  // collects them, so they're dropped here rather than converted.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop them from the service payload
  const { video_url, image_url, cues_ar, cues_en, steps_ar, steps_en, mistakes_ar, mistakes_en, primary_muscles, secondary_muscles, ...input } = parsed.data;
  try {
    await new LibraryService(supabase).createGlobalExercise({
      ...input,
      video_url: video_url || undefined,
      image_url: image_url || undefined,
      cues_ar: linesToArray(cues_ar),
      cues_en: linesToArray(cues_en),
    });
  } catch (err) {
    return { error: libraryErrorKey(err) };
  }
  revalidatePath(`/${locale}/admin/library`);
}

export async function createGlobalFoodAction(
  locale: string,
  formData: FormData
): Promise<ActionResult> {
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

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new LibraryService(supabase).createGlobalFood(parsed.data);
  } catch (err) {
    return { error: libraryErrorKey(err) };
  }
  revalidatePath(`/${locale}/admin/library`);
}

export async function updateGlobalExerciseAction(
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
  });
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  // Same drop-not-convert reasoning as createGlobalExerciseAction above.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop them from the service payload
  const { video_url, image_url, cues_ar, cues_en, steps_ar, steps_en, mistakes_ar, mistakes_en, primary_muscles, secondary_muscles, ...input } = parsed.data;
  try {
    // admin_update_global is qualified `coach_id is null`, so an attempt to
    // edit a coach's private row matches 0 rows and lands here as false.
    const updated = await new LibraryService(supabase).updateExercise(id, {
      ...input,
      video_url: video_url || undefined,
      image_url: image_url || undefined,
      cues_ar: linesToArray(cues_ar),
      cues_en: linesToArray(cues_en),
    });
    if (!updated) return { error: "not_found_or_forbidden" };
  } catch (err) {
    return { error: libraryErrorKey(err) };
  }
  revalidatePath(`/${locale}/admin/library`);
}

export async function deleteGlobalExerciseAction(locale: string, id: string): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    const deleted = await new LibraryService(supabase).deleteExercise(id);
    if (!deleted) return { error: "not_found_or_forbidden" };
  } catch (err) {
    return { error: libraryErrorKey(err) };
  }
  revalidatePath(`/${locale}/admin/library`);
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
  revalidatePath(`/${locale}/admin/library`);
}

export async function promoteExerciseAction(locale: string, id: string): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new LibraryService(supabase).promoteExercise(id);
  } catch (err) {
    return { error: libraryErrorKey(err) };
  }
  // The promoted row is now global, so it changes what every coach sees.
  revalidatePath(`/${locale}/admin/library`);
  revalidatePath(`/${locale}/library`);
}

export async function promoteFoodAction(locale: string, id: string): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new LibraryService(supabase).promoteFood(id);
  } catch (err) {
    return { error: libraryErrorKey(err) };
  }
  revalidatePath(`/${locale}/admin/library`);
  revalidatePath(`/${locale}/library`);
}
