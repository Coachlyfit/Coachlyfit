"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { NutritionLogsService } from "@/domain/nutrition/nutrition-logs.service";
import {
  bodyProfileSchema,
  isLoggableDate,
  logIntakeSchema,
  offPlanSchema,
  reminderSettingsSchema,
} from "@/domain/nutrition/nutrition.schema";

type ActionResult = { error: string } | void;

async function currentClientRow(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // maybeSingle: a client whose invite was never accepted has no row yet.
  const { data } = await supabase.from("clients").select("id, coach_id").eq("profile_id", user.id).maybeSingle();
  return data;
}

// Service writes can still fail on a DB rule (e.g. the 7-day edit lock);
// surface that as an error code instead of a thrown 500.
async function attempt(write: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await write();
  } catch {
    return { error: "save_failed" };
  }
}

export async function logNutritionAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = logIntakeSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  if (!isLoggableDate(parsed.data.log_date, new Date())) return { error: "date_out_of_range" };

  const supabase = await createClient();
  const client = await currentClientRow(supabase);
  if (!client) return { error: "not_linked" };

  const result = await attempt(() =>
    new NutritionLogsService(supabase).logIntake(client.coach_id, client.id, parsed.data)
  );
  revalidatePath(`/${locale}/c/diet`);
  return result;
}

export async function reportOffPlanAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = offPlanSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  if (!isLoggableDate(parsed.data.log_date, new Date())) return { error: "date_out_of_range" };

  const supabase = await createClient();
  const client = await currentClientRow(supabase);
  if (!client) return { error: "not_linked" };

  // Storage RLS already scopes reads, but don't store a path pointing
  // outside this client's own folder (same check as addProgressPhotoAction).
  const photo = parsed.data.photo_path;
  if (photo && !photo.startsWith(`${client.coach_id}/${client.id}/`)) return { error: "invalid_photo" };

  const result = await attempt(() =>
    new NutritionLogsService(supabase).reportOffPlan(client.coach_id, client.id, parsed.data)
  );
  revalidatePath(`/${locale}/c/diet`);
  return result;
}

export async function saveReminderSettingsAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = reminderSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const client = await currentClientRow(supabase);
  if (!client) return { error: "not_linked" };

  const result = await attempt(() => new NutritionLogsService(supabase).saveReminderSettings(client.id, parsed.data));
  revalidatePath(`/${locale}/c/diet`);
  return result;
}

export async function saveMyBodyProfileAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = bodyProfileSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const client = await currentClientRow(supabase);
  if (!client) return { error: "not_linked" };

  const result = await attempt(() => new NutritionLogsService(supabase).saveBodyProfile(client.id, parsed.data));
  revalidatePath(`/${locale}/c/diet`);
  return result;
}
