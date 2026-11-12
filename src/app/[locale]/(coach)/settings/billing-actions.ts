"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-coach";
import { ClientBillingService } from "@/domain/billing/client-billing.service";

type ActionResult = { error: string } | void;

const packageSchema = z.object({
  name_ar: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
  duration_days: z.coerce.number().int().min(1).max(3650),
  price_egp: z.coerce.number().min(0),
});

const paymentMethodSchema = z.object({
  name_ar: z.string().min(1).max(60),
  name_en: z.string().min(1).max(60),
});

export async function createPackageAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = packageSchema.safeParse({
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
    duration_days: formData.get("duration_days"),
    price_egp: formData.get("price_egp"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireOwner();
  if ("error" in auth) return auth;

  await new ClientBillingService(auth.supabase).createPackage(auth.coachId, parsed.data);
  revalidatePath(`/${locale}/settings`);
}

export async function updatePackageAction(locale: string, id: string, formData: FormData): Promise<ActionResult> {
  const parsed = packageSchema.safeParse({
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
    duration_days: formData.get("duration_days"),
    price_egp: formData.get("price_egp"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireOwner();
  if ("error" in auth) return auth;

  await new ClientBillingService(auth.supabase).updatePackage(id, parsed.data);
  revalidatePath(`/${locale}/settings`);
}

export async function deletePackageAction(locale: string, id: string): Promise<ActionResult> {
  const auth = await requireOwner();
  if ("error" in auth) return auth;

  try {
    const ok = await new ClientBillingService(auth.supabase).deletePackage(id);
    if (!ok) return { error: "not_found_or_forbidden" };
  } catch {
    // Foreign key restrict from client_subscriptions.package_id — a
    // package a client has actually been subscribed to can't be deleted.
    return { error: "package_in_use" };
  }
  revalidatePath(`/${locale}/settings`);
}

export async function createPaymentMethodAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = paymentMethodSchema.safeParse({
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireOwner();
  if ("error" in auth) return auth;

  await new ClientBillingService(auth.supabase).createPaymentMethod(auth.coachId, parsed.data);
  revalidatePath(`/${locale}/settings`);
}

export async function deletePaymentMethodAction(locale: string, id: string): Promise<ActionResult> {
  const auth = await requireOwner();
  if ("error" in auth) return auth;

  try {
    const ok = await new ClientBillingService(auth.supabase).deletePaymentMethod(id);
    if (!ok) return { error: "not_found_or_forbidden" };
  } catch {
    return { error: "payment_method_in_use" };
  }
  revalidatePath(`/${locale}/settings`);
}
