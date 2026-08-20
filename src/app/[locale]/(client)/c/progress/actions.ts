"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ProgressService } from "@/domain/progress/progress.service";
import { checkinSchema } from "./schemas";
import { bodyMetricSchema } from "./metric-schemas";

type ActionResult = { error: string } | void;

async function currentClientRow(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("clients").select("id, coach_id").eq("profile_id", user.id).single();
  return data;
}

export async function submitCheckinAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = checkinSchema.safeParse({
    checkin_date: formData.get("checkin_date"),
    weight: formData.get("weight") || undefined,
    mood: formData.get("mood") || undefined,
    energy: formData.get("energy") || undefined,
    adherence: formData.get("adherence") || undefined,
    sleep_hours: formData.get("sleep_hours") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const client = await currentClientRow(supabase);
  if (!client) return { error: "not_authenticated" };

  await new ProgressService(supabase).submitCheckin(client.coach_id, client.id, parsed.data);
  revalidatePath(`/${locale}/c/progress`);
  revalidatePath(`/${locale}/c`);
}

export async function addBodyMetricAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = bodyMetricSchema.safeParse({
    taken_on: formData.get("taken_on"),
    metric: formData.get("metric"),
    value: formData.get("value"),
    unit: formData.get("unit"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const client = await currentClientRow(supabase);
  if (!client) return { error: "not_authenticated" };

  await new ProgressService(supabase).addBodyMetric(client.coach_id, client.id, parsed.data);
  revalidatePath(`/${locale}/c/progress`);
}

export async function addProgressPhotoAction(
  locale: string,
  storagePath: string,
  pose?: "front" | "side" | "back"
): Promise<ActionResult> {
  const supabase = await createClient();
  const client = await currentClientRow(supabase);
  if (!client) return { error: "not_authenticated" };

  // RLS would already block reading a foreign path, but a dangling media
  // row pointing outside this client's own folder is still garbage —
  // catch it here rather than trust the browser-uploaded path blindly.
  const expectedPrefix = `${client.coach_id}/${client.id}/`;
  if (!storagePath.startsWith(expectedPrefix)) return { error: "invalid_input" };

  await new ProgressService(supabase).addMedia(client.coach_id, client.id, {
    storage_path: storagePath,
    kind: "photo",
    pose,
  });
  revalidatePath(`/${locale}/c/progress`);
  revalidatePath(`/${locale}/c/checkin`);
}
