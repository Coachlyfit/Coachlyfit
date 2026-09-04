"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";
import { createDietPlanSchema, mealSchema, mealItemSchema, reorderSchema } from "./schemas";

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
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { start_date, end_date, name_ar, name_en } = parsed.data;
  const updated = await new DietPlansService(supabase).update(id, {
    name_ar,
    name_en,
    start_date: start_date || undefined,
    end_date: end_date || null,
  });
  if (!updated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets`);
  revalidatePath(`/${locale}/diets/${id}`);
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
  clientId: string
): Promise<CreateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const cloned = await new DietPlansService(supabase).cloneToClient(dietPlanId, clientId);
  if (!cloned) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/diets`);
  return { id: cloned.id };
}

export async function addMealAction(locale: string, dietPlanId: string, formData: FormData): Promise<ActionResult> {
  const parsed = mealSchema.safeParse({
    label_ar: formData.get("label_ar") || "",
    label_en: formData.get("label_en") || "",
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
