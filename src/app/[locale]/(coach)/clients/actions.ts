"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { InvitesService, joinUrl } from "@/domain/clients/invites.service";
import { AlreadyYourClientError } from "@/domain/relationships/relationships.service";
import { ProgressService } from "@/domain/progress/progress.service";
import { ClientBillingService } from "@/domain/billing/client-billing.service";
import { ObservationsService, type ObservationLinkOptions } from "@/domain/clients/observations.service";
import type { AppLocale } from "@/domain/locale";
import { ClientsService } from "@/domain/clients/clients.service";
import {
  createInviteSchema,
  createSubscriptionSchema,
  recordTransactionSchema,
  observationSchema,
  updateClientSchema,
  type ObservationInput,
} from "./schemas";
import { observationImagePathOk } from "@/domain/clients/observations";

type ActionResult = { error: string } | { joinUrl: string };
type CreateInviteActionResult = ActionResult | { linked: true };
type VoidActionResult = { error: string } | void;

/** private.enforce_client_cap raises for two reasons: the seat cap, or a
 * lapsed subscription (hint: subscription_inactive). */
function capError(error: unknown): string {
  return (error as { hint?: string } | null)?.hint === "subscription_inactive"
    ? "subscription_inactive"
    : "client_limit_reached";
}

export async function createClientInviteAction(
  locale: string,
  formData: FormData
): Promise<CreateInviteActionResult> {
  const parsed = createInviteSchema.safeParse({
    displayName: formData.get("displayName") || undefined,
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };
  const { data: coach } = await supabase.from("coaches").select("slug").eq("id", coachId).single();
  if (!coach) return { error: "not_authenticated" };

  try {
    const result = await new InvitesService(supabase).createInvite(coachId, parsed.data);
    // Existing client account: they accept from their own app, no link.
    if (result.linked) return { linked: true };
    revalidatePath(`/${locale}/clients`);
    return { joinUrl: joinUrl(locale, result.token, coach.slug) };
  } catch (error) {
    if (error instanceof AlreadyYourClientError) return { error: "already_your_client" };
    // Most likely the client-cap trigger (private.enforce_client_cap) —
    // the tier limit is enforced in the DB, not just the UI.
    return { error: capError(error) };
  }
}

export async function regenerateInviteAction(
  locale: string,
  clientId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };
  const { data: coach } = await supabase.from("coaches").select("slug").eq("id", coachId).single();
  if (!coach) return { error: "not_authenticated" };

  try {
    const { token } = await new InvitesService(supabase).regenerateInvite(coachId, clientId);
    return { joinUrl: joinUrl(locale, token, coach.slug) };
  } catch {
    return { error: "signup_failed" };
  }
}

// Coach-initiated only — see coach_delete policy on `media`
// (20260810000001_media_coach_delete.sql). RLS is the real gate; the
// unauthenticated check here only turns an anonymous call into a clean
// error instead of an RLS-rejected exception.
export async function deleteMediaAction(locale: string, clientId: string, mediaId: string): Promise<VoidActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const deleted = await new ProgressService(supabase).deleteMedia(mediaId);
  if (!deleted) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/clients/${clientId}`);
}

export async function createSubscriptionAction(
  locale: string,
  clientId: string,
  formData: FormData
): Promise<VoidActionResult> {
  const parsed = createSubscriptionSchema.safeParse({
    package_id: formData.get("package_id"),
    end_date: formData.get("end_date"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  await new ClientBillingService(supabase).createSubscription(coachId, { client_id: clientId, ...parsed.data });
  revalidatePath(`/${locale}/clients/${clientId}`);
}

export async function freezeSubscriptionAction(
  locale: string,
  clientId: string,
  subscriptionId: string
): Promise<VoidActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const ok = await new ClientBillingService(supabase).freezeSubscription(subscriptionId);
  if (!ok) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/clients/${clientId}`);
}

export async function unfreezeSubscriptionAction(
  locale: string,
  clientId: string,
  subscriptionId: string
): Promise<VoidActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const ok = await new ClientBillingService(supabase).unfreezeSubscription(subscriptionId);
  if (!ok) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/clients/${clientId}`);
}

export async function cancelSubscriptionAction(
  locale: string,
  clientId: string,
  subscriptionId: string
): Promise<VoidActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const ok = await new ClientBillingService(supabase).cancelSubscription(subscriptionId);
  if (!ok) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/clients/${clientId}`);
}

export async function recordTransactionAction(
  locale: string,
  clientId: string,
  formData: FormData
): Promise<VoidActionResult> {
  const parsed = recordTransactionSchema.safeParse({
    subscription_id: formData.get("subscription_id"),
    payment_method_id: formData.get("payment_method_id"),
    amount_egp: formData.get("amount_egp"),
    transaction_date: formData.get("transaction_date") || "",
    proof_path: formData.get("proof_path") || "",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  const { transaction_date, proof_path, ...rest } = parsed.data;
  // A client's own storage-path prefix check (RLS would already block a
  // foreign path) — same "don't trust a browser-uploaded path blindly"
  // reasoning as addProgressPhotoAction in (client)/c/progress/actions.ts.
  if (proof_path && !proof_path.startsWith(`${coachId}/${clientId}/`)) return { error: "invalid_input" };

  await new ClientBillingService(supabase).recordTransaction(coachId, {
    client_id: clientId,
    ...rest,
    transaction_date: transaction_date || undefined,
    proof_path: proof_path || null,
    recorded_by: user.id,
  });
  revalidatePath(`/${locale}/clients/${clientId}`);
}

/** Shared by create/update: zod + auth + image-path check. Plain-object input
 * (not FormData) because the note has nested fields (linked item). */
async function parseObservation(clientId: string, input: unknown) {
  const parsed = observationSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" } as const;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" } as const;
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" } as const;

  const { image_path } = parsed.data;
  if (image_path && !observationImagePathOk(image_path, coachId, clientId)) return { error: "invalid_input" } as const;

  return { supabase, coachId, fields: parsed.data };
}

export async function createObservationAction(
  locale: string,
  clientId: string,
  input: ObservationInput
): Promise<VoidActionResult> {
  const ctx = await parseObservation(clientId, input);
  if (ctx.error) return { error: ctx.error };

  await new ObservationsService(ctx.supabase).create(ctx.coachId, clientId, ctx.fields);
  revalidatePath(`/${locale}/clients/${clientId}`);
}

export async function updateObservationAction(
  locale: string,
  clientId: string,
  observationId: string,
  input: ObservationInput
): Promise<VoidActionResult> {
  const ctx = await parseObservation(clientId, input);
  if (ctx.error) return { error: ctx.error };

  const updated = await new ObservationsService(ctx.supabase).update(observationId, ctx.fields);
  if (!updated) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/clients/${clientId}`);
}

/** Programs + recent check-ins for the note's "link" picker, fetched on demand
 * (the dialog is mounted on every note card and in the header). RLS-scoped. */
export async function getObservationLinkOptionsAction(
  locale: AppLocale,
  clientId: string
): Promise<ObservationLinkOptions> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { programs: [], checkins: [] };
  return new ObservationsService(supabase).linkOptions(clientId, locale);
}

export async function deleteObservationAction(
  locale: string,
  clientId: string,
  observationId: string
): Promise<VoidActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const deleted = await new ObservationsService(supabase).remove(observationId);
  if (!deleted) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/clients/${clientId}`);
}

export async function updateClientAction(
  locale: string,
  clientId: string,
  formData: FormData
): Promise<VoidActionResult> {
  const parsed = updateClientSchema.safeParse({
    displayName: formData.get("displayName") || undefined,
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const ok = await new ClientsService(supabase).update(clientId, {
    display_name: parsed.data.displayName,
    email: parsed.data.email,
    phone: parsed.data.phone,
  });
  if (!ok) return { error: "not_found_or_forbidden" };
  revalidatePath(`/${locale}/clients`);
  revalidatePath(`/${locale}/clients/${clientId}`);
}

export async function setClientArchivedAction(
  locale: string,
  clientId: string,
  archived: boolean
): Promise<VoidActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    const ok = await new ClientsService(supabase).setArchived(clientId, archived);
    if (!ok) return { error: "not_found_or_forbidden" };
  } catch (error) {
    // Restoring past the seat cap trips clients_enforce_cap_on_restore
    // (same DB-level guard createClientInviteAction relies on).
    return { error: capError(error) };
  }
  revalidatePath(`/${locale}/clients`);
  revalidatePath(`/${locale}/clients/${clientId}`);
}
