"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PlatformSettingsService } from "@/domain/platform/settings.service";
import { platformSettingsSchemas, isSettingKey } from "@/domain/platform/settings.schema";
import { tiersSchema, userProfileSchema, userRoleSchema } from "./schemas";

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

/** Saves every plan at once: admin_update_tiers() is a single transaction, so
 * the comparison table never ends up half-saved. */
export async function updateTiersAction(locale: string, tiers: unknown): Promise<ActionResult> {
  const parsed = tiersSchema.safeParse(tiers);
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const { error: rpcError } = await supabase.rpc("admin_update_tiers", {
    p_tiers: parsed.data.map(
      ({ forms_builder, custom_library, priority_support, white_label, custom_branding, task_management, ...rest }) => ({
        ...rest,
        features: { forms_builder, custom_library, priority_support, white_label, custom_branding, task_management },
      })
    ),
  });
  if (rpcError) return { error: rpcErrorCode(rpcError.code) };

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
