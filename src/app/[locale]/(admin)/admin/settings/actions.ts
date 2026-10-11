"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PlatformSettingsService } from "@/domain/platform/settings.service";
import { platformSettingsSchemas, isSettingKey } from "@/domain/platform/settings.schema";
import { tierSchema, userProfileSchema, userRoleSchema } from "./schemas";

type ActionResult = { error: string } | void;

export async function updateSettingAction(locale: string, key: string, value: unknown): Promise<ActionResult> {
  if (!isSettingKey(key)) return { error: "invalid_input" };
  const parsed = platformSettingsSchemas[key].safeParse(value);
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, userId, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new PlatformSettingsService(supabase).set(key, parsed.data, userId);
  } catch {
    return { error: "update_failed" };
  }
  revalidatePath(`/${locale}/admin/settings`);
  revalidatePath(`/${locale}`, "layout");
}

export async function updateTierAction(locale: string, tierId: string, formData: FormData): Promise<ActionResult> {
  const parsed = tierSchema.safeParse({
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
    price_egp_monthly: formData.get("price_egp_monthly"),
    max_clients: formData.get("max_clients"),
    is_active: formData.get("is_active") === "true",
    forms_builder: formData.get("forms_builder") === "true",
    custom_library: formData.get("custom_library") === "true",
    priority_support: formData.get("priority_support") === "true",
    white_label: formData.get("white_label") === "true",
    custom_branding: formData.get("custom_branding") === "true",
  });
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const { forms_builder, custom_library, priority_support, white_label, custom_branding, ...rest } = parsed.data;
  const { error: dbError } = await supabase
    .from("subscription_tiers")
    .update({
      ...rest,
      features: { forms_builder, custom_library, priority_support, white_label, custom_branding },
    })
    .eq("id", tierId);
  if (dbError) return { error: "update_failed" };

  revalidatePath(`/${locale}/admin/settings`);
  revalidatePath(`/${locale}`);
}

export async function setUserRoleAction(locale: string, userId: string, role: string): Promise<ActionResult> {
  const parsed = userRoleSchema.safeParse(role);
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const { error: rpcError } = await supabase.rpc("admin_set_role", { p_user_id: userId, p_role: parsed.data });
  if (rpcError) return { error: rpcError.code === "42501" ? "forbidden" : "update_failed" };

  revalidatePath(`/${locale}/admin/settings`);
}

export async function setUserSuspendedAction(locale: string, userId: string, suspended: boolean): Promise<ActionResult> {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const { error: rpcError } = await supabase.rpc("admin_set_suspended", {
    p_user_id: userId,
    p_suspended: suspended,
  });
  if (rpcError) return { error: rpcError.code === "42501" ? "forbidden" : "update_failed" };

  revalidatePath(`/${locale}/admin/settings`);
}

function rpcErrorCode(code: string | undefined): string {
  if (code === "42501") return "forbidden";
  if (code === "P0002") return "not_found";
  return "update_failed";
}

export async function updateUserProfileAction(
  locale: string,
  userId: string,
  input: { fullName: string; phone: string }
): Promise<ActionResult> {
  const parsed = userProfileSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const { error: rpcError } = await supabase.rpc("admin_update_user_profile", {
    p_user_id: userId,
    p_full_name: parsed.data.fullName,
    p_phone: parsed.data.phone,
  });
  if (rpcError) return { error: rpcErrorCode(rpcError.code) };

  revalidatePath(`/${locale}/admin/settings`);
}
