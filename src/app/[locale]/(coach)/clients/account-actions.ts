"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { InvitesService, hashInviteToken } from "@/domain/clients/invites.service";
import {
  confirmClientLogin,
  createClientLogin,
  deleteClientLogin,
  getClientAccountState,
  isClientAccount,
} from "@/domain/clients/client-account";
import { activateClientSchema, setClientPasswordSchema } from "./schemas";

type VoidActionResult = { error: string } | void;

/** Coach-side login management for a client. The auth calls behind these
 * actions use the service-role client, which bypasses RLS, so every check
 * RLS would normally do happens here first:
 *  - the caller is the tenant OWNER (team members can't take over logins)
 *  - the roster row is visible to them through RLS
 *  - their coaching relationship with this client is currently active
 *    (clients switch coaches; an ex-coach must lose this power)
 *  - the account is a client account (never a coach/admin login) */
async function loadOwnedClient(clientId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" } as const;
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { ok: false, error: "not_authenticated" } as const;
  if (coachId !== user.id) return { ok: false, error: "owner_only" } as const;

  const [{ data: client }, { data: relationship }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, display_name, email, profile_id, status")
      .eq("id", clientId)
      .maybeSingle(),
    supabase
      .from("coaching_relationships")
      .select("id")
      .eq("client_id", clientId)
      .eq("coach_id", coachId)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (!client || !relationship || client.status === "archived") return { ok: false, error: "not_found_or_forbidden" } as const;

  return { ok: true, supabase, coachId, client } as const;
}

/** One action for both "can't log in" cases:
 * - no account yet: create a confirmed login with the email + password the
 *   coach sets. Goes through a fresh invite token so handle_new_user() links
 *   it exactly like a normal invite signup (no second linking path).
 * - signed up but unconfirmed: confirm the email (and optionally set a new
 *   password). */
export async function activateClientAction(
  locale: string,
  clientId: string,
  formData: FormData
): Promise<VoidActionResult> {
  const parsed = activateClientSchema.safeParse({
    email: formData.get("email") || undefined,
    password: formData.get("password") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const owned = await loadOwnedClient(clientId);
  if (!owned.ok) return { error: owned.error };
  const { supabase, coachId, client } = owned;
  const password = parsed.data.password || undefined;

  const state = await getClientAccountState(client.profile_id);
  if (state === "ready") return { error: "already_active" };

  if (state === "unconfirmed" && client.profile_id) {
    if (!(await isClientAccount(client.profile_id))) return { error: "not_found_or_forbidden" };
    if (!(await confirmClientLogin(client.profile_id, password))) return { error: "update_failed" };
    revalidatePath(`/${locale}/clients/${clientId}`);
    return;
  }

  const email = (parsed.data.email || client.email || "").trim().toLowerCase();
  if (!email) return { error: "email_required" };
  if (!password) return { error: "password_required" };

  let token: string;
  try {
    ({ token } = await new InvitesService(supabase).regenerateInvite(coachId, clientId));
  } catch {
    return { error: "update_failed" };
  }

  const created = await createClientLogin({
    email,
    password,
    fullName: client.display_name,
    locale,
    inviteTokenHash: hashInviteToken(token),
  });
  if ("error" in created) return { error: created.error };

  // handle_new_user() links in the same transaction; if it somehow didn't
  // (row claimed concurrently), don't leave an orphan login behind.
  const { data: linked } = await supabase.from("clients").select("profile_id").eq("id", clientId).maybeSingle();
  if (linked?.profile_id !== created.userId) {
    await deleteClientLogin(created.userId);
    return { error: "update_failed" };
  }

  if (!client.email) await supabase.from("clients").update({ email }).eq("id", clientId);

  revalidatePath(`/${locale}/clients/${clientId}`);
}

export async function setClientPasswordAction(
  locale: string,
  clientId: string,
  formData: FormData
): Promise<VoidActionResult> {
  const parsed = setClientPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { error: "invalid_input" };

  const owned = await loadOwnedClient(clientId);
  if (!owned.ok) return { error: owned.error };
  const { client } = owned;

  if (!client.profile_id) return { error: "no_account" };
  if (!(await isClientAccount(client.profile_id))) return { error: "not_found_or_forbidden" };

  // Confirms too: a coach setting the password means "they can log in now".
  if (!(await confirmClientLogin(client.profile_id, parsed.data.password))) return { error: "update_failed" };

  revalidatePath(`/${locale}/clients/${clientId}`);
}
