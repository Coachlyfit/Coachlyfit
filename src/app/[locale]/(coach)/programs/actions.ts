"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ProgramsService } from "@/domain/programs/programs.service";
import { createProgramSchema, daySchema, itemSchema, reorderSchema } from "./schemas";

type ActionResult = { error: string } | void;
type CreateResult = { error: string } | { id: string };

// Server actions are individually addressable POST endpoints — they do NOT
// inherit the (coach) layout's guard, so each one re-checks auth itself.
// RLS is still the authority on WHICH rows; this only rejects anonymous
// callers early and turns an RLS no-op into a message instead of a lie.

export async function createProgramAction(locale: string, formData: FormData): Promise<CreateResult> {
  const parsed = createProgramSchema.safeParse({
    client_id: formData.get("client_id") || "",
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
    start_date: formData.get("start_date") || "",
    end_date: formData.get("end_date") || "",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { client_id, start_date, end_date, ...rest } = parsed.data;
  const program = await new ProgramsService(supabase).create(user.id, {
    ...rest,
    client_id: client_id || null,
    start_date: start_date || undefined,
    end_date: end_date || null,
  });
  revalidatePath(`/${locale}/programs`);
  return { id: program.id };
}

export async function updateProgramAction(locale: string, id: string, formData: FormData): Promise<ActionResult> {
  const parsed = createProgramSchema.safeParse({
    client_id: formData.get("client_id") || "",
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
    start_date: formData.get("start_date") || "",
    end_date: formData.get("end_date") || "",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { start_date, end_date, name_ar, name_en } = parsed.data;
  const updated = await new ProgramsService(supabase).update(id, {
    name_ar,
    name_en,
    start_date: start_date || undefined,
    end_date: end_date || null,
  });
  if (!updated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs`);
  revalidatePath(`/${locale}/programs/${id}`);
}

export async function deleteProgramAction(locale: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const deleted = await new ProgramsService(supabase).remove(id);
  if (!deleted) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs`);
}

// Deviates from the void-on-success convention by returning the new
// program's id — the assign dialog needs it to redirect into the client's
// copy right after cloning.
export async function cloneProgramAction(
  locale: string,
  programId: string,
  clientId: string
): Promise<CreateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const cloned = await new ProgramsService(supabase).cloneToClient(programId, clientId);
  if (!cloned) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs`);
  return { id: cloned.id };
}

export async function addDayAction(locale: string, programId: string, formData: FormData): Promise<ActionResult> {
  const parsed = daySchema.safeParse({
    day_index: formData.get("day_index"),
    label_ar: formData.get("label_ar") || "",
    label_en: formData.get("label_en") || "",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const added = await new ProgramsService(supabase).addDay(programId, parsed.data);
  if (!added) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function updateDayAction(
  locale: string,
  programId: string,
  dayId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = daySchema.partial().safeParse({
    day_index: formData.get("day_index") || undefined,
    label_ar: formData.get("label_ar") || "",
    label_en: formData.get("label_en") || "",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const updated = await new ProgramsService(supabase).updateDay(dayId, parsed.data);
  if (!updated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function deleteDayAction(locale: string, programId: string, dayId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const deleted = await new ProgramsService(supabase).removeDay(dayId);
  if (!deleted) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function addItemAction(
  locale: string,
  programId: string,
  dayId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = itemSchema.safeParse({
    exercise_id: formData.get("exercise_id"),
    sets: formData.get("sets") || undefined,
    reps: formData.get("reps") || undefined,
    rest_seconds: formData.get("rest_seconds") || undefined,
    notes_ar: formData.get("notes_ar") || "",
    notes_en: formData.get("notes_en") || "",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const added = await new ProgramsService(supabase).addItem(dayId, parsed.data);
  if (!added) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function updateItemAction(
  locale: string,
  programId: string,
  itemId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = itemSchema.partial().safeParse({
    exercise_id: formData.get("exercise_id") || undefined,
    sets: formData.get("sets") || undefined,
    reps: formData.get("reps") || undefined,
    rest_seconds: formData.get("rest_seconds") || undefined,
    notes_ar: formData.get("notes_ar") || "",
    notes_en: formData.get("notes_en") || "",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const updated = await new ProgramsService(supabase).updateItem(itemId, parsed.data);
  if (!updated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function deleteItemAction(locale: string, programId: string, itemId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const deleted = await new ProgramsService(supabase).removeItem(itemId);
  if (!deleted) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function reorderDaysAction(locale: string, programId: string, ids: string[]): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse({ ids });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  await new ProgramsService(supabase).reorderDays(programId, parsed.data.ids);
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function reorderItemsAction(
  locale: string,
  programId: string,
  dayId: string,
  ids: string[]
): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse({ ids });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  await new ProgramsService(supabase).reorderItems(dayId, parsed.data.ids);
  revalidatePath(`/${locale}/programs/${programId}`);
}
