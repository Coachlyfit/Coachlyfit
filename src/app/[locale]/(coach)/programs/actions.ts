"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { ProgramsService } from "@/domain/programs/programs.service";
import { ReviewService, type StructuredAdjustment } from "@/domain/progress/review.service";
import { adjustmentSchema } from "../review/schemas";
import { z } from "zod";
import { createProgramSchema, daySchema, itemSchema, reorderSchema, saveAsTemplateSchema } from "./schemas";

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
    schedule_mode: formData.get("schedule_mode") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  const { client_id, start_date, end_date, ...rest } = parsed.data;
  const program = await new ProgramsService(supabase).create(coachId, {
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
    schedule_mode: formData.get("schedule_mode") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { start_date, end_date, name_ar, name_en, schedule_mode } = parsed.data;
  const updated = await new ProgramsService(supabase).update(id, {
    name_ar,
    name_en,
    start_date: start_date || undefined,
    end_date: end_date || null,
    schedule_mode,
  });
  if (!updated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs`);
  revalidatePath(`/${locale}/programs/${id}`);
}

// Soft delete: archives instead of removing, so it can be undone from the
// trash view. Hard delete only happens via the 30-day cron.
export async function deleteProgramAction(locale: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const archived = await new ProgramsService(supabase).archive(id);
  if (!archived) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs`);
}

export async function restoreProgramAction(locale: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const restored = await new ProgramsService(supabase).restore(id);
  if (!restored) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs`);
}

export async function listArchivedProgramsAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return new ProgramsService(supabase).listArchived();
}

// Deviates from the void-on-success convention by returning the new
// program's id — the assign dialog needs it to redirect into the client's
// copy right after cloning.
export async function cloneProgramAction(
  locale: string,
  programId: string,
  clientId: string,
  replaceActive = false
): Promise<CreateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const cloned = await new ProgramsService(supabase).cloneToClient(programId, clientId, replaceActive);
  if (!cloned) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs`);
  revalidatePath(`/${locale}/clients/${clientId}`);
  return { id: cloned.id };
}

// Reverse of cloneProgramAction: saves an assigned program back out as a
// template. Same id-returning deviation, for the same reason — the dialog
// redirects into the new template right after saving.
export async function saveProgramAsTemplateAction(
  locale: string,
  programId: string,
  formData: FormData
): Promise<CreateResult> {
  const parsed = saveAsTemplateSchema.safeParse({
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const saved = await new ProgramsService(supabase).saveAsTemplate(
    programId,
    parsed.data.name_ar,
    parsed.data.name_en
  );
  if (!saved) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs`);
  return { id: saved.id };
}

export async function addDayAction(locale: string, programId: string, formData: FormData): Promise<ActionResult> {
  const parsed = daySchema.safeParse({
    day_index: formData.get("day_index"),
    label_ar: formData.get("label_ar") || "",
    label_en: formData.get("label_en") || "",
    weekday: formData.get("weekday") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const programs = new ProgramsService(supabase);
  await programs.snapshotIfAssigned(programId, "add_day");
  const added = await programs.addDay(programId, parsed.data);
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
    weekday: formData.get("weekday") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const programs = new ProgramsService(supabase);
  await programs.snapshotIfAssigned(programId, "update_day");
  const updated = await programs.updateDay(dayId, parsed.data);
  if (!updated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function deleteDayAction(locale: string, programId: string, dayId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const programs = new ProgramsService(supabase);
  await programs.snapshotIfAssigned(programId, "delete_day");
  const deleted = await programs.removeDay(dayId);
  if (!deleted) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs/${programId}`);
}

// `sets` is a JSON-encoded array in one FormData field — FormData has no
// native way to carry a nested array of {reps, weight, rest_seconds}.
function parseSetsField(formData: FormData): unknown {
  const raw = formData.get("sets");
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function addItemAction(
  locale: string,
  programId: string,
  dayId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = itemSchema.safeParse({
    exercise_id: formData.get("exercise_id"),
    sets: parseSetsField(formData),
    progression_rule: formData.get("progression_rule") || undefined,
    notes_ar: formData.get("notes_ar") || "",
    notes_en: formData.get("notes_en") || "",
    block: formData.get("block") || undefined,
    coach_note_private: formData.get("coach_note_private") || "",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const programs = new ProgramsService(supabase);
  await programs.snapshotIfAssigned(programId, "add_item");
  const added = await programs.addItem(dayId, parsed.data);
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
    sets: parseSetsField(formData),
    progression_rule: formData.get("progression_rule") || undefined,
    notes_ar: formData.get("notes_ar") || "",
    notes_en: formData.get("notes_en") || "",
    block: formData.get("block") || undefined,
    coach_note_private: formData.get("coach_note_private") || "",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const programs = new ProgramsService(supabase);
  await programs.snapshotIfAssigned(programId, "update_item");
  const updated = await programs.updateItem(itemId, parsed.data);
  if (!updated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function deleteItemAction(locale: string, programId: string, itemId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const programs = new ProgramsService(supabase);
  await programs.snapshotIfAssigned(programId, "delete_item");
  const deleted = await programs.removeItem(itemId);
  if (!deleted) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function duplicateDayAction(locale: string, programId: string, dayId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const programs = new ProgramsService(supabase);
  await programs.snapshotIfAssigned(programId, "duplicate_day");
  const duplicated = await programs.duplicateDay(dayId);
  if (!duplicated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function duplicateItemAction(locale: string, programId: string, itemId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const programs = new ProgramsService(supabase);
  await programs.snapshotIfAssigned(programId, "duplicate_item");
  const duplicated = await programs.duplicateItem(itemId);
  if (!duplicated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function replaceItemExerciseAction(
  locale: string,
  programId: string,
  itemId: string,
  exerciseId: string
): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(exerciseId);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const programs = new ProgramsService(supabase);
  await programs.snapshotIfAssigned(programId, "replace_exercise");
  const replaced = await programs.replaceItemExercise(itemId, parsed.data);
  if (!replaced) return { error: "not_found_or_forbidden" };
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

  try {
    await new ProgramsService(supabase).reorderItems(dayId, parsed.data.ids);
  } catch (err) {
    // group_not_contiguous — the drag would split a superset/circuit's
    // members apart; the builder should never construct such a drop in
    // the first place, but this is the server-side backstop either way.
    if (err instanceof Error && err.message === "group_not_contiguous") {
      return { error: "group_not_contiguous" };
    }
    throw err;
  }
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function groupItemsAction(
  locale: string,
  programId: string,
  itemIds: string[],
  kind: "superset" | "circuit"
): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse({ ids: itemIds });
  if (!parsed.success || parsed.data.ids.length < 2) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const programs = new ProgramsService(supabase);
  await programs.snapshotIfAssigned(programId, "group_items");
  await programs.groupItems(parsed.data.ids, kind);
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function ungroupItemsAction(locale: string, programId: string, itemIds: string[]): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse({ ids: itemIds });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const programs = new ProgramsService(supabase);
  await programs.snapshotIfAssigned(programId, "ungroup_items");
  await programs.ungroupItems(parsed.data.ids);
  revalidatePath(`/${locale}/programs/${programId}`);
}

export async function listRevisionsAction(programId: string) {
  const supabase = await createClient();
  return new ProgramsService(supabase).listRevisions(programId);
}

/** Restores a program to a prior snapshot -- snapshots the CURRENT state
 * first (so restoring is itself undoable) before overwriting it, same
 * "snapshot before you mutate" rule every other structural action here
 * follows. */
export async function restoreRevisionAction(
  locale: string,
  programId: string,
  revisionId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const programs = new ProgramsService(supabase);
  await programs.snapshotIfAssigned(programId, "before_restore");
  const restored = await programs.restoreRevision(revisionId);
  if (!restored) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/programs/${programId}`);
}

// Read-only, RLS-scoped — same "no auth check needed" reasoning as
// searchExercisesAction/getExerciseAction in library/actions.ts. Flattens
// program_days -> program_items into a flat list the review console's
// exercise multi-select and the pending-adjustments banner both consume,
// fetched on demand rather than eagerly for every review-queue entry.
export async function listActiveProgramItemsAction(clientId: string) {
  const supabase = await createClient();
  const tree = await new ProgramsService(supabase).getActiveTreeForClient(clientId);
  if (!tree) return [];
  return tree.program_days.flatMap((day) =>
    day.program_items.map((item) => ({
      id: item.id,
      exercise_id: item.exercise_id,
      exercises: { name_ar: item.exercises.name_ar, name_en: item.exercises.name_en },
    }))
  );
}

/** Turns one structured review adjustment into a real program mutation,
 * then marks the checkin as applied so the banner drops it. `itemIds: []`
 * on reduceLoad means "whole active program" — resolved here via
 * getActiveTreeForClient (the client's current program, which may or may
 * not be `programId` itself) rather than trusting a client-picked list. */
export async function applyAdjustmentAction(
  locale: string,
  programId: string,
  checkinId: string,
  adjustment: StructuredAdjustment
): Promise<ActionResult> {
  const parsed = adjustmentSchema.safeParse(adjustment);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const programs = new ProgramsService(supabase);

  switch (parsed.data.key) {
    case "reduceLoad": {
      let itemIds = parsed.data.itemIds;
      if (itemIds.length === 0) {
        const tree = await programs.getTree(programId);
        if (!tree?.client_id) return { error: "not_found_or_forbidden" };
        const activeTree = await programs.getActiveTreeForClient(tree.client_id);
        itemIds = activeTree ? activeTree.program_days.flatMap((d) => d.program_items.map((i) => i.id)) : [];
      }
      if (itemIds.length > 0) await programs.applyLoadReduction(itemIds, parsed.data.percent);
      break;
    }
    case "removeMovement":
      for (const itemId of parsed.data.itemIds) await programs.removeItem(itemId);
      break;
    default:
      // extraWarmup/extraRestDay are message-only — nothing to mutate.
      break;
  }

  await new ReviewService(supabase).markAdjustmentApplied(checkinId);
  revalidatePath(`/${locale}/programs/${programId}`);
}
