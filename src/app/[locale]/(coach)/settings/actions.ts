"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCoach } from "@/lib/auth/require-coach";
import { SLUG_PATTERN } from "@/lib/tenant/portal-slug";
import { businessProfileSchema } from "./business-profile-schema";
import { brandSchema } from "./brand-schema";

type ActionResult = { error: string } | void;

// A malformed slug fails fast with `invalid_input` instead of a raw 23514
// falling through to update_failed.
const slugSchema = z.string().regex(SLUG_PATTERN);

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
  // A custom address needs white_label (coaches_guard_white_label,
  // 20261018000001); saving the unchanged one doesn't trip it.
  if (error?.hint === "upgrade_required") return { error: "upgrade_required" };
  if (error) return { error: error.code === "23505" ? "slug_taken" : "update_failed" };

  revalidatePath(`/${locale}/settings`);
}

/** email_notifications lives on profiles, not coaches — this toggles the
 * caller's own row directly rather than going through requireCoach(), so
 * it works the same for a coach or a client (both are profiles). RLS's
 * profiles_update_own already scopes the update to the caller. */
export async function updateEmailNotificationsAction(locale: string, enabled: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { error } = await supabase.from("profiles").update({ email_notifications: enabled }).eq("id", user.id);
  if (error) return { error: "update_failed" };

  revalidatePath(`/${locale}/settings/account`);
}

const emailSchema = z.string().email();

/** Doesn't change the session email immediately — Supabase sends a
 * confirmation link to the new address first, and the change only takes
 * effect once that's clicked (routing back through /auth/confirm). */
export async function changeEmailAction(locale: string, email: string): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data },
    { emailRedirectTo: `${appUrl}/auth/confirm?next=/${locale}/settings/account` }
  );
  if (error) return { error: "update_failed" };
}

/** Invoice header fields. Only the tenant owner can write their coaches row
 * (coaches_update_own is `id = auth.uid()`), so a team member's save is an
 * RLS no-op -- same as updateSlugAction. logo_path must sit in the coach's
 * own coach-logos folder; the storage policy already enforces that for the
 * upload, this stops pointing the column at someone else's file. */
export async function updateBusinessProfileAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = businessProfileSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireCoach();
  if ("error" in auth) return auth;

  const { logo_path, ...fields } = parsed.data;
  if (logo_path && !logo_path.startsWith(`${auth.coachId}/`)) return { error: "invalid_input" };

  const { error } = await auth.supabase
    .from("coaches")
    .update({
      ...fields,
      address: fields.address || null,
      tax_number: fields.tax_number || null,
      contact_phone: fields.contact_phone || null,
      contact_email: fields.contact_email || null,
      logo_path,
    })
    .eq("id", auth.coachId);
  // Setting a new logo needs white_label; keeping or removing one doesn't.
  if (error) return { error: error.hint === "upgrade_required" ? "upgrade_required" : "update_failed" };

  revalidatePath(`/${locale}/settings`);
}

/** Brand colors (Studio). The plan check is the coaches_guard_branding
 * trigger (20261011000001_coach_branding.sql), not this action -- a coach
 * without the custom_branding flag gets its P0001 back as upgrade_required.
 * Clearing a color is always allowed. Revalidates the whole locale layout
 * since every coach and client page picks the colors up from its layout. */
export async function updateBrandingAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireCoach();
  if ("error" in auth) return auth;

  const { error } = await auth.supabase
    .from("coaches")
    .update({
      brand_primary: parsed.data.brand_primary || null,
      brand_accent: parsed.data.brand_accent || null,
      brand_sidebar: parsed.data.brand_sidebar || null,
      brand_sidebar_text: parsed.data.brand_sidebar_text || null,
    })
    .eq("id", auth.coachId);
  if (error) return { error: error.hint === "upgrade_required" ? "upgrade_required" : "update_failed" };

  revalidatePath(`/${locale}`, "layout");
}
