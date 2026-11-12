"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-coach";
import { MetricDefinitionsService } from "@/domain/progress/metric-definitions.service";

type ActionResult = { error: string } | void;

const metricDefinitionSchema = z.object({
  label_ar: z.string().min(1).max(60),
  label_en: z.string().min(1).max(60),
  unit: z.string().min(1).max(20),
});

export async function createMetricDefinitionAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = metricDefinitionSchema.safeParse({
    label_ar: formData.get("label_ar"),
    label_en: formData.get("label_en"),
    unit: formData.get("unit"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireOwner();
  if ("error" in auth) return auth;

  try {
    await new MetricDefinitionsService(auth.supabase).create(auth.coachId, parsed.data);
  } catch {
    // Most likely the (coach_id, key) unique constraint -- two labels that
    // slugify to the same key (e.g. "Neck" and "neck!!").
    return { error: "metric_already_exists" };
  }
  revalidatePath(`/${locale}/settings`);
}

export async function deleteMetricDefinitionAction(locale: string, id: string): Promise<ActionResult> {
  const auth = await requireOwner();
  if ("error" in auth) return auth;

  const ok = await new MetricDefinitionsService(auth.supabase).remove(id);
  if (!ok) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/settings`);
}
