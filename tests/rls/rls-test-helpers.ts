// Shared plumbing for tests/rls/*.test.ts: one admin client, one way to
// create auth-user fixtures, and automatic teardown so a suite run never
// leaves @example.test rows behind (see scripts/cleanup-rls-test-users.mts,
// written to mop up a run that leaked into the hosted project because
// nothing here used to clean up after itself).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY!;

if (!URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error(
    "Missing Supabase env vars for the RLS suite — run `supabase start` and check .env.test.local."
  );
}

export const rlsAdmin = createClient<Database>(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const createdUserIds: string[] = [];

afterAll(async () => {
  await Promise.all(createdUserIds.map((id) => rlsAdmin.auth.admin.deleteUser(id)));
});

/** Tracks a user id (e.g. from client.auth.signUp, which this helper module
 * doesn't call itself) for deletion in this file's afterAll. */
export function trackRlsUser(userId: string) {
  createdUserIds.push(userId);
}

/** Creates an auth user fixture and an already-signed-in client for it.
 * Tracked for automatic deletion in this file's afterAll.
 *
 * handle_new_user() no longer takes 'admin' from signup metadata, and only
 * takes 'client' with a valid invite (20261017000001), so those two roles
 * are set here with the service-role client instead: the user is created as
 * a coach with team_invite (no coaches row), then the profile is updated.
 *
 * A coach fixture is moved to the plan with every feature. A new coach
 * starts on the cheapest tier's trial, which since 20261018000001 can't add
 * custom library entries or more than one form; suites that aren't about
 * plan limits shouldn't trip over that. */
export async function createRlsUser(
  tag: string,
  userMetadata: Record<string, unknown>
): Promise<{ userId: string; email: string; client: SupabaseClient<Database> }> {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = "correct horse battery staple";

  const role = userMetadata.role;
  const setRole = role === "admin" || role === "client" ? role : null;

  const { data, error } = await rlsAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: setRole ? { ...userMetadata, role: "coach", team_invite: true } : userMetadata,
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  createdUserIds.push(data.user.id);

  if (setRole) {
    const update = await rlsAdmin.from("profiles").update({ role: setRole }).eq("id", data.user.id);
    if (update.error) throw update.error;
  } else if (!userMetadata.team_invite) {
    const { data: tier } = await rlsAdmin.from("subscription_tiers").select("id").eq("key", "elite").single();
    if (tier) {
      const upgrade = await rlsAdmin.from("subscriptions").update({ tier_id: tier.id }).eq("coach_id", data.user.id);
      if (upgrade.error) throw upgrade.error;
    }
  }

  const client = createClient<Database>(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  return { userId: data.user.id, email, client };
}
