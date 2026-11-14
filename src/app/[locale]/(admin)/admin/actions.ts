"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  coachNoteSchema,
  recordPaymentSchema,
  resolveRequestSchema,
  updateSubscriptionSchema,
  type UpdateSubscriptionInput,
} from "./schemas";
import { userEmailSchema } from "./settings/schemas";

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

/** Best-effort: the auth-side change already happened and can't be rolled
 * back, so a failed log write is reported to the server log rather than
 * turned into a user-facing failure. */
async function logUserAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: "email_change" | "password_reset" | "delete",
  details: Record<string, unknown>,
  targetEmail?: string | null,
  targetName?: string | null
) {
  const { error } = await supabase.rpc("admin_log_user_action", {
    p_target: userId,
    p_action: action,
    p_details: details as Json,
    p_target_email: targetEmail ?? undefined,
    p_target_name: targetName ?? undefined,
  });
  if (error) console.error("admin audit log write failed", { action, userId, code: error.code });
}

function gateErrorCode(code: string | undefined): string {
  if (code === "42501") return "forbidden";
  if (code === "P0002") return "not_found";
  return "update_failed";
}

/** Email lives only in auth.users, so this needs the Auth Admin API. The DB
 * gate (admin_authorize_user_action) runs first -- the service-role client is
 * never reached unless it passes. email_confirm skips the confirmation
 * round-trip: the admin is vouching for the address. */
export async function updateUserEmailAction(locale: string, userId: string, email: string): Promise<ActionResult> {
  const parsed = userEmailSchema.safeParse(email);
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const { error: gateError } = await supabase.rpc("admin_authorize_user_action", {
    p_user_id: userId,
    p_action: "email",
  });
  if (gateError) return { error: gateErrorCode(gateError.code) };

  const admin = createAdminClient();
  const { data: before } = await admin.auth.admin.getUserById(userId);
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    email: parsed.data,
    email_confirm: true,
  });
  if (authError) return { error: authError.code === "email_exists" ? "email_taken" : "update_failed" };

  await logUserAction(supabase, userId, "email_change", {
    email: { from: before.user?.email ?? null, to: parsed.data },
  });

  revalidatePath(`/${locale}/admin/settings`);
}

/** Emails the user a standard recovery link (same flow as /forgot-password);
 * the admin never sees or sets a password. */
export async function sendPasswordResetAction(locale: string, userId: string): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const { error: gateError } = await supabase.rpc("admin_authorize_user_action", {
    p_user_id: userId,
    p_action: "email",
  });
  if (gateError) return { error: gateErrorCode(gateError.code) };

  const { data, error: userError } = await createAdminClient().auth.admin.getUserById(userId);
  const email = data.user?.email;
  if (userError || !email) return { error: "no_email" };

  const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/${locale}/reset-password`,
  });
  if (resetError) return { error: "reset_failed" };

  await logUserAction(supabase, userId, "password_reset", {}, email);
}

/** Permanent. Cascades through profiles (and, for a coach, all their clients,
 * programs, messages, payments...). Typed-email confirmation is re-checked
 * here so it isn't a client-only gate. */
export async function deleteUserAction(locale: string, userId: string, confirmEmail: string): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const { error: gateError } = await supabase.rpc("admin_authorize_user_action", {
    p_user_id: userId,
    p_action: "delete",
  });
  if (gateError) return { error: gateErrorCode(gateError.code) };

  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", userId).single();
  if (!data.user || data.user.email?.toLowerCase() !== confirmEmail.trim().toLowerCase()) {
    return { error: "confirm_mismatch" };
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return { error: "delete_failed" };

  // Snapshot passed explicitly: the row is gone, so the DB can't look it up.
  await logUserAction(supabase, userId, "delete", { role: profile?.role ?? null }, data.user.email ?? null, profile?.full_name ?? null);

  revalidatePath(`/${locale}/admin/settings`);
}

// Subscription management. Each RPC re-checks private.is_admin() and writes
// its own admin_audit_log row in the same transaction; requireAdmin() here
// only fails fast with a usable message.

function subscriptionErrorCode(code: string | undefined): string {
  if (code === "42501") return "forbidden";
  if (code === "P0002") return "not_found";
  if (code === "22023" || code === "23514" || code === "23503") return "invalid_input";
  return "update_failed";
}

function revalidateCoach(locale: string, coachId?: string) {
  revalidatePath(`/${locale}/admin`);
  revalidatePath(`/${locale}/admin/requests`);
  if (coachId) revalidatePath(`/${locale}/admin/coaches/${coachId}`);
}

export async function updateSubscriptionAction(locale: string, input: UpdateSubscriptionInput): Promise<ActionResult> {
  const parsed = updateSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const { error: rpcError } = await supabase.rpc("admin_update_subscription", {
    p_coach_id: parsed.data.coachId,
    p_tier_id: parsed.data.tierId,
    p_status: parsed.data.status,
    p_period_end: parsed.data.periodEnd || undefined,
    p_cancel_at_period_end: parsed.data.cancelAtPeriodEnd,
    p_complimentary: parsed.data.complimentary,
  });
  if (rpcError) return { error: subscriptionErrorCode(rpcError.code) };

  revalidateCoach(locale, parsed.data.coachId);
}

export async function resolveSubscriptionRequestAction(
  locale: string,
  input: { requestId: string; approve: boolean; response: string }
): Promise<ActionResult> {
  const parsed = resolveRequestSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const { error: rpcError } = await supabase.rpc("admin_resolve_subscription_request", {
    p_request_id: parsed.data.requestId,
    p_approve: parsed.data.approve,
    p_response: parsed.data.response || undefined,
  });
  if (rpcError) return { error: rpcError.code === "22023" ? "already_resolved" : subscriptionErrorCode(rpcError.code) };

  revalidatePath(`/${locale}/admin`, "layout");
}

export async function addCoachNoteAction(locale: string, input: { coachId: string; note: string }): Promise<ActionResult> {
  const parsed = coachNoteSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const { error: rpcError } = await supabase.rpc("admin_add_coach_note", {
    p_coach_id: parsed.data.coachId,
    p_note: parsed.data.note,
  });
  if (rpcError) return { error: subscriptionErrorCode(rpcError.code) };

  revalidateCoach(locale, parsed.data.coachId);
}

/** Account suspension (profiles.suspended_at): the coach's own login is
 * bounced to /suspended. Per profile, so team members' logins are not
 * affected. admin_set_suspended() logs it. */
export async function setCoachSuspendedAction(locale: string, coachId: string, suspended: boolean): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const { error: rpcError } = await supabase.rpc("admin_set_suspended", {
    p_user_id: coachId,
    p_suspended: suspended,
  });
  if (rpcError) return { error: subscriptionErrorCode(rpcError.code) };

  revalidateCoach(locale, coachId);
}
