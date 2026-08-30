"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";

type ActionResult = { error: string } | void;

/** `templateId: null` clears the setting — a coach turning auto-send back
 * off, not an error state. RLS (coach_rw-equivalent policy on coaches)
 * already stops a coach from pointing this at a template that isn't theirs;
 * no extra ownership check needed here. */
export async function updateDefaultCheckinTemplateAction(
  locale: string,
  templateId: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  const { error } = await supabase
    .from("coaches")
    .update({ default_checkin_template_id: templateId })
    .eq("id", coachId);
  if (error) return { error: "update_failed" };

  revalidatePath(`/${locale}/settings`);
}

/** coaches.slug has a unique index + the DNS-label CHECK constraint added in
 * 20260826000001_portal_branding.sql -- format errors and slug collisions
 * both come back as a Postgres error here rather than app-level validation,
 * so a 23505 (someone else already has this slug) gets a friendly message
 * and everything else (including a 23514 check-constraint miss) falls back
 * to the generic update_failed key. */
export async function updateSlugAction(locale: string, slug: string): Promise<ActionResult> {
  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  const { error } = await supabase.from("coaches").update({ slug }).eq("id", coachId);
  if (error) return { error: error.code === "23505" ? "slug_taken" : "update_failed" };

  revalidatePath(`/${locale}/settings`);
}
