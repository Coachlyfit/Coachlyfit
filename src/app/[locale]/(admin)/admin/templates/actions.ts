"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { LIBRARY_CATEGORIES } from "@/domain/programs/platform/library-view";
import { PLAN_LEVELS } from "@/domain/programs/plan-meta";

type ActionResult = { error: string } | void;

const publishSchema = z.object({ id: z.string().uuid(), published: z.boolean() });

const metaSchema = z.object({
  id: z.string().uuid(),
  name_ar: z.string().trim().min(1).max(120),
  name_en: z.string().trim().min(1).max(120),
  description_ar: z.string().trim().max(500),
  description_en: z.string().trim().max(500),
  level: z.enum(PLAN_LEVELS).nullable(),
  days_per_week: z.number().int().min(1).max(7).nullable(),
  duration_weeks: z.number().int().min(1).max(52).nullable(),
  gender_target: z.enum(["female", "male", "all"]).nullable(),
  categories: z.array(z.enum(LIBRARY_CATEGORIES)),
});

function revalidate(locale: string) {
  revalidatePath(`/${locale}/admin/templates`);
  revalidatePath(`/${locale}/programs/library`);
}

/** Platform templates only (`coach_id is null`); the admin RLS policy
 * (platform_admin_rw) is the real gate, requireAdmin just fails fast. */
export async function setTemplatePublishedAction(locale: string, id: string, published: boolean): Promise<ActionResult> {
  const parsed = publishSchema.safeParse({ id, published });
  if (!parsed.success) return { error: "invalid_input" };
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const { data, error: updateError } = await supabase
    .from("programs")
    .update({ published: parsed.data.published })
    .eq("id", parsed.data.id)
    .is("coach_id", null)
    .select("id");
  if (updateError) return { error: "unknown" };
  if (data.length === 0) return { error: "not_found" };
  revalidate(locale);
}

export async function updateTemplateDetailsAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = metaSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const { id, ...fields } = parsed.data;
  const { data, error: updateError } = await supabase
    .from("programs")
    .update({
      ...fields,
      description_ar: fields.description_ar || null,
      description_en: fields.description_en || null,
    })
    .eq("id", id)
    .is("coach_id", null)
    .select("id");
  if (updateError) return { error: "unknown" };
  if (data.length === 0) return { error: "not_found" };
  revalidate(locale);
}
