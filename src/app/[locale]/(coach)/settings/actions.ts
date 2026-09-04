"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/auth/require-coach";

type ActionResult = { error: string } | void;

// Mirrors the coaches_slug_format CHECK constraint
// (20260826000001_portal_branding.sql) so a malformed slug fails fast with
// `invalid_input` instead of a raw 23514 falling through to update_failed.
const slugSchema = z.string().regex(/^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$/);

/** `templateId: null` clears the setting — a coach turning auto-send back
 * off, not an error state. RLS (coach_rw-equivalent policy on coaches)
 * already stops a coach from pointing this at a template that isn't theirs;
 * no extra ownership check needed here. */
export async function updateDefaultCheckinTemplateAction(
  locale: string,
  templateId: string | null
): Promise<ActionResult> {
  const auth = await requireCoach();
  if ("error" in auth) return auth;

  const { error } = await auth.supabase
    .from("coaches")
    .update({ default_checkin_template_id: templateId })
    .eq("id", auth.coachId);
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
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireCoach();
  if ("error" in auth) return auth;

  const { error } = await auth.supabase.from("coaches").update({ slug: parsed.data }).eq("id", auth.coachId);
  if (error) return { error: error.code === "23505" ? "slug_taken" : "update_failed" };

  revalidatePath(`/${locale}/settings`);
}
