"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordPaymentSchema } from "./schemas";

type ActionResult = { error: string } | void;

// Admin-only is enforced inside record_payment() itself (private.is_admin()
// check, raises 42501) — not re-checked here, consistent with "auth checks
// belong in DB policies/functions" rather than scattered app-layer guards.
export async function recordPaymentAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = recordPaymentSchema.safeParse({
    coachId: formData.get("coachId"),
    amountEgp: formData.get("amountEgp"),
    method: formData.get("method"),
    reference: formData.get("reference") || undefined,
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_payment", {
    p_coach_id: parsed.data.coachId,
    p_amount_egp: parsed.data.amountEgp,
    p_method: parsed.data.method,
    p_period_start: parsed.data.periodStart,
    p_period_end: parsed.data.periodEnd,
    p_reference: parsed.data.reference,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" };
    if (error.code === "P0002") return { error: "not_found" };
    return { error: "invalid_input" };
  }
  revalidatePath(`/${locale}/admin`);
}

/** Impersonation: begin_impersonation() is the actual authorization
 * boundary (raises 42501 if the caller isn't admin, 22023 if the coach
 * doesn't exist) and writes the audit row atomically with that check —
 * this action never proceeds to the service-role call unless that already
 * succeeded. createAdminClient() is used ONLY for the two Auth Admin API
 * calls below, which have no RLS-respecting equivalent (they mint a
 * session), and only after the DB has already vetted the request. */
export async function impersonateCoachAction(
  locale: string,
  coachId: string
): Promise<{ error: string } | { url: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("begin_impersonation", { p_coach_id: coachId });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" };
    if (error.code === "22023") return { error: "not_found" };
    return { error: "unknown" };
  }

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(coachId);
  if (userError || !userData.user?.email) return { error: "no_email" };

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  if (linkError || !linkData.properties?.hashed_token) return { error: "unknown" };

  const next = encodeURIComponent(`/${locale}/dashboard`);
  const url = `/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink&next=${next}&impersonating=1`;
  return { url };
}
