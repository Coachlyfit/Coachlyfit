import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// The coach-side Auth Admin API calls for client logins (activate, set
// password) — auth.users has no RLS-respecting equivalent. Allowlisted for
// the admin client in eslint.config.mjs, like admin/actions.ts.
//
// Nothing here checks who is asking. Callers MUST first prove the caller
// may manage this client (see loadOwnedClient in
// (coach)/clients/account-actions.ts) and pass only the profile_id from that
// RLS-scoped clients read — never an id taken from the request.

/** Login state of a roster row's auth account, as the coach sees it:
 * - none: no account yet (invite never used)
 * - unconfirmed: signed up but never confirmed their email, so can't log in
 * - ready: can log in */
export type ClientAccountState = "none" | "unconfirmed" | "ready";

export async function getClientAccountState(profileId: string | null): Promise<ClientAccountState> {
  if (!profileId) return "none";
  const { data, error } = await createAdminClient().auth.admin.getUserById(profileId);
  if (error || !data.user) return "none";
  return data.user.email_confirmed_at ? "ready" : "unconfirmed";
}

/** Guards against ever touching a coach/admin login through these paths. */
export async function isClientAccount(profileId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("profiles").select("role").eq("id", profileId).maybeSingle();
  return data?.role === "client";
}

/** Confirms the email and, when given, replaces the password. */
export async function confirmClientLogin(profileId: string, password?: string): Promise<boolean> {
  const { error } = await createAdminClient().auth.admin.updateUserById(profileId, {
    email_confirm: true,
    ...(password ? { password } : {}),
  });
  return !error;
}

/** Creates a confirmed client login. Linking to the roster row happens in
 * handle_new_user() via inviteTokenHash, exactly like an invite signup. */
export async function createClientLogin(input: {
  email: string;
  password: string;
  fullName: string;
  locale: string;
  inviteTokenHash: string;
}): Promise<{ userId: string } | { error: "email_taken" | "update_failed" }> {
  const { data, error } = await createAdminClient().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      role: "client",
      full_name: input.fullName,
      locale: input.locale,
      invite_token_hash: input.inviteTokenHash,
    },
  });
  if (error || !data.user) return { error: error?.code === "email_exists" ? "email_taken" : "update_failed" };
  return { userId: data.user.id };
}

/** Only for undoing a createClientLogin() that didn't link. */
export async function deleteClientLogin(userId: string): Promise<void> {
  await createAdminClient().auth.admin.deleteUser(userId);
}
