"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";
import {
  createDietPlanSchema,
  dietTargetsSchema,
  mealSchema,
  mealItemSchema,
  reorderSchema,
  saveAsTemplateSchema,
} from "./schemas";

type ActionResult = { error: string } | void;
type CreateResult = { error: string } | { id: string };

// Same reasoning as programs/actions.ts: server actions are independently
// addressable POST endpoints, they do not inherit the (coach) layout's
// guard, so each one re-checks auth. RLS is still the authority on which
// rows; this only turns an RLS no-op into a message instead of a lie.

export async function createDietPlanAction(locale: string, formData: FormData): Promise<CreateResult> {
  const parsed = createDietPlanSchema.safeParse({
    client_id: formData.get("client_id") || "",
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
    start_date: formData.get("start_date") || "",
    end_date: formData.get("end_date") || "",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  const { client_id, start_date, end_date, ...rest } = parsed.data;
  const plan = await new DietPlansService(supabase).create(coachId, {
    ...rest,
    client_id: client_id || null,
    start_date: start_date || undefined,
    end_date: end_date || null,
  });
  revalidatePath(`/${locale}/diets`);
  return { id: plan.id };
}

export async function updateDietPlanAction(locale: string, id: string, formData: FormData): Promise<ActionResult> {
  const parsed = createDietPlanSchema.safeParse({
    client_id: formData.get("client_id") || "",
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
    start_date: formData.get("start_date") || "",
    end_date: formData.get("end_date") || "",
    notes_ar: formData.get("notes_ar") || "",
    notes_en: formData.get("notes_en") || "",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { start_date, end_date, name_ar, name_en, target_kcal, target_protein_g, target_carb_g, target_fat_g, notes_ar, notes_en } =
    parsed.data;
  const updated = await new DietPlansService(supabase).update(id, {
    name_ar,
    name_en,
    start_date: start_date || undefined,
    end_date: end_date || null,
    target_kcal,
    target_protein_g,
    target_carb_g,
    target_fat_g,
    notes_ar: notes_ar || null,
    notes_en: notes_en || null,
  });
  if (!updated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets`);
  revalidatePath(`/${locale}/diets/${id}`);
}

// Targets-only update — the macro sidebar's own small form, separate from
// the full plan-edit dialog so setting a target doesn't require touching
// name/dates too.
export async function updateDietTargetsAction(
  locale: string,
  dietPlanId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = dietTargetsSchema.safeParse({
    target_kcal: formData.get("target_kcal") || "",
    target_protein_g: formData.get("target_protein_g") || "",
    target_carb_g: formData.get("target_carb_g") || "",
    target_fat_g: formData.get("target_fat_g") || "",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  // Typed by hand in the builder, so no longer the suggestion's numbers.
  const updated = await new DietPlansService(supabase).update(dietPlanId, {
    ...parsed.data,
    targets_source: "manual",
    targets_suggestion: null,
  });
  if (!updated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets/${dietPlanId}`);
}

// Soft delete: archives instead of removing, so it can be undone from the
// trash view. Hard delete only happens via the 30-day cron.
export async function deleteDietPlanAction(locale: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const archived = await new DietPlansService(supabase).archive(id);
  if (!archived) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets`);
}

export async function restoreDietPlanAction(locale: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const restored = await new DietPlansService(supabase).restore(id);
  if (!restored) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets`);
}

export async function listArchivedDietPlansAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return new DietPlansService(supabase).listArchived();
}

// Deviates from the void-on-success convention by returning the new plan's
// id -- the assign dialog needs it to redirect into the client's copy right
// after cloning. Same as programs/actions.ts's cloneProgramAction.
export async function cloneDietPlanAction(
  locale: string,
  dietPlanId: string,
  clientId: string,
  replaceActive = false
): Promise<CreateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const cloned = await new DietPlansService(supabase).cloneToClient(dietPlanId, clientId, replaceActive);
  if (!cloned) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets`);
  revalidatePath(`/${locale}/clients/${clientId}`);
  return { id: cloned.id };
}

// Reverse of cloneDietPlanAction: saves an assigned plan back out as a
// template. Same id-returning deviation, for the same reason.
export async function saveDietPlanAsTemplateAction(
  locale: string,
  dietPlanId: string,
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

  const saved = await new DietPlansService(supabase).saveAsTemplate(
    dietPlanId,
    parsed.data.name_ar,
    parsed.data.name_en
  );
  if (!saved) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets`);
  return { id: saved.id };
}

export async function addMealAction(locale: string, dietPlanId: string, formData: FormData): Promise<ActionResult> {
  const parsed = mealSchema.safeParse({
    label_ar: formData.get("label_ar") || "",
    label_en: formData.get("label_en") || "",
    time_of_day: formData.get("time_of_day") || "",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const added = await new DietPlansService(supabase).addMeal(dietPlanId, parsed.data);
  if (!added) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets/${dietPlanId}`);
}

export async function updateMealAction(
  locale: string,
  dietPlanId: string,
  mealId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = mealSchema.partial().safeParse({
    label_ar: formData.get("label_ar") || "",
    label_en: formData.get("label_en") || "",
    time_of_day: formData.get("time_of_day") || "",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const updated = await new DietPlansService(supabase).updateMeal(mealId, parsed.data);
  if (!updated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets/${dietPlanId}`);
}

export async function deleteMealAction(locale: string, dietPlanId: string, mealId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const deleted = await new DietPlansService(supabase).removeMeal(mealId);
  if (!deleted) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets/${dietPlanId}`);
}

export async function addMealItemAction(
  locale: string,
  dietPlanId: string,
  mealId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = mealItemSchema.safeParse({
    food_id: formData.get("food_id"),
    quantity: formData.get("quantity"),
    unit: formData.get("unit"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const added = await new DietPlansService(supabase).addItem(mealId, parsed.data);
  if (!added) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets/${dietPlanId}`);
}

export async function updateMealItemAction(
  locale: string,
  dietPlanId: string,
  itemId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = mealItemSchema.partial().safeParse({
    food_id: formData.get("food_id") || undefined,
    quantity: formData.get("quantity") || undefined,
    unit: formData.get("unit") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const updated = await new DietPlansService(supabase).updateItem(itemId, parsed.data);
  if (!updated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets/${dietPlanId}`);
}

export async function deleteMealItemAction(
  locale: string,
  dietPlanId: string,
  itemId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const deleted = await new DietPlansService(supabase).removeItem(itemId);
  if (!deleted) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets/${dietPlanId}`);
}

export async function reorderMealsAction(locale: string, dietPlanId: string, ids: string[]): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse({ ids });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  await new DietPlansService(supabase).reorderMeals(dietPlanId, parsed.data.ids);
  revalidatePath(`/${locale}/diets/${dietPlanId}`);
}

export async function reorderMealItemsAction(
  locale: string,
  dietPlanId: string,
  mealId: string,
  ids: string[]
): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse({ ids });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  await new DietPlansService(supabase).reorderItems(mealId, parsed.data.ids);
  revalidatePath(`/${locale}/diets/${dietPlanId}`);
}

// Quantity-only edit from the builder's inline input — the common edit by
// far, so it skips re-sending food_id/unit.
export async function setItemQuantityAction(
  locale: string,
  dietPlanId: string,
  itemId: string,
  quantity: number
): Promise<ActionResult> {
  const parsed = mealItemSchema.shape.quantity.safeParse(quantity);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const updated = await new DietPlansService(supabase).updateItem(itemId, { quantity: parsed.data });
  if (!updated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets/${dietPlanId}`);
}

// Duplicate within the same plan (targetPlanId === dietPlanId) or copy to a
// sibling variant. RLS decides whether the target is writable.
export async function copyMealAction(
  locale: string,
  dietPlanId: string,
  mealId: string,
  targetPlanId: string
): Promise<ActionResult> {
  const ids = z.string().uuid().array().length(2).safeParse([mealId, targetPlanId]);
  if (!ids.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const copied = await new DietPlansService(supabase).copyMeal(mealId, targetPlanId);
  if (!copied) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets/${dietPlanId}`);
  if (targetPlanId !== dietPlanId) revalidatePath(`/${locale}/diets/${targetPlanId}`);
}

// The empty-plan shortcut. Labels are data stored in both languages, so
// they're read from both message files rather than the request locale.
const STARTER_MEALS = [
  { key: "breakfast", time: "08:00" },
  { key: "lunch", time: "13:00" },
  { key: "snack", time: "16:30" },
  { key: "dinner", time: "20:00" },
] as const;

export async function addStarterMealsAction(locale: string, dietPlanId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const [tAr, tEn] = await Promise.all([
    getTranslations({ locale: "ar", namespace: "diets.starterMeals" }),
    getTranslations({ locale: "en", namespace: "diets.starterMeals" }),
  ]);
  const added = await new DietPlansService(supabase).addMeals(
    dietPlanId,
    STARTER_MEALS.map(({ key, time }) => ({ label_ar: tAr(key), label_en: tEn(key), time_of_day: time }))
  );
  if (!added) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets/${dietPlanId}`);
}

// "Duplicate as new variant": same client/program, "(copy)" names. Returns
// the new id so the builder can jump straight into it.
export async function duplicateDietPlanAction(locale: string, dietPlanId: string): Promise<CreateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const service = new DietPlansService(supabase);
  const source = await service.getTree(dietPlanId);
  if (!source) return { error: "not_found_or_forbidden" };

  const [tAr, tEn] = await Promise.all([
    getTranslations({ locale: "ar", namespace: "diets" }),
    getTranslations({ locale: "en", namespace: "diets" }),
  ]);
  const copy = await service.duplicate(
    dietPlanId,
    tAr("copyName", { name: source.name_ar }).slice(0, 100),
    tEn("copyName", { name: source.name_en }).slice(0, 100)
  );
  if (!copy) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets`);
  if (source.program_id) revalidatePath(`/${locale}/programs/${source.program_id}`);
  return { id: copy.id };
}
