// finalize_oauth_signup() (20261123000005): completes a brand-new Google signup.
// handle_new_user() can't see terms/invite for OAuth users, so the auth callback
// records them through this one-shot definer function. Google users are
// simulated with the admin API (app_metadata.provider = 'google'); the real
// Google round trip / identity auto-linking is Supabase's own and is verified
// manually.
import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { createRlsUser, rlsAdmin, trackRlsUser } from "./rls-test-helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PASSWORD = "correct horse battery staple";
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;

function anonClient() {
  return createClient<Database>(URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function googleUser(tag: string) {
  const email = uniqueEmail(`g-${tag}`);
  const { data, error } = await rlsAdmin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { provider: "google", providers: ["google"] },
    // What Google returns: no role / terms / invite keys.
    user_metadata: { full_name: "G User", name: "G User", avatar_url: "https://example.test/a.png", email_verified: true },
  });
  if (error || !data.user) throw error ?? new Error("no user");
  trackRlsUser(data.user.id);
  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error) throw signIn.error;
  return { userId: data.user.id, email, client };
}

async function profileOf(userId: string) {
  return (
    await rlsAdmin
      .from("profiles")
      .select("role, locale, terms_version, terms_accepted_at")
      .eq("id", userId)
      .single()
  ).data!;
}

async function createInvite(coach: SupabaseClient<Database>, coachId: string) {
  const { data: clientRow, error } = await coach
    .from("clients")
    .insert({ coach_id: coachId, display_name: "Invited" })
    .select("id")
    .single();
  if (error) throw error;
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const inv = await coach.from("invites").insert({ coach_id: coachId, client_id: clientRow.id, token_hash: tokenHash });
  if (inv.error) throw inv.error;
  return { token, clientId: clientRow.id as string };
}

let coach: { userId: string; client: SupabaseClient<Database> };
beforeAll(async () => {
  coach = await createRlsUser("oauth-coach", { role: "coach", full_name: "Coach", business_name: "Gym", locale: "ar" });
}, 30_000);

describe("a new Google user before finalize", () => {
  it("becomes a coach with no terms and the default locale (why finalize exists)", async () => {
    const g = await googleUser("pre");
    expect(await profileOf(g.userId)).toMatchObject({
      role: "coach",
      locale: "ar",
      terms_version: null,
      terms_accepted_at: null,
    });
  });
});

describe("finalize_oauth_signup", () => {
  it("records terms and locale once, then refuses a second call", async () => {
    const g = await googleUser("once");
    const first = await g.client.rpc("finalize_oauth_signup", { p_terms_version: "2026-10-13", p_locale: "en" });
    expect(first.error).toBeNull();
    expect(await profileOf(g.userId)).toMatchObject({ locale: "en", terms_version: "2026-10-13" });

    const second = await g.client.rpc("finalize_oauth_signup", { p_terms_version: "2030-01-01", p_locale: "ar" });
    expect(second.error?.hint).toBe("already_finalized");
    expect(await profileOf(g.userId)).toMatchObject({ locale: "en", terms_version: "2026-10-13" });
  });

  it("rejects a malformed terms version and an unknown locale, leaving the profile untouched", async () => {
    const g = await googleUser("bad");
    expect((await g.client.rpc("finalize_oauth_signup", { p_terms_version: "latest", p_locale: "en" })).error).not.toBeNull();
    expect((await g.client.rpc("finalize_oauth_signup", { p_terms_version: "2026-10-13", p_locale: "fr" })).error).not.toBeNull();
    expect((await profileOf(g.userId)).terms_accepted_at).toBeNull();
  });

  it("is not available to email-provider accounts (can't rewrite terms later)", async () => {
    const r = await coach.client.rpc("finalize_oauth_signup", { p_terms_version: "2026-10-13", p_locale: "en" });
    expect(r.error).not.toBeNull();
  });

  it("is not callable anonymously", async () => {
    const r = await anonClient().rpc("finalize_oauth_signup", { p_terms_version: "2026-10-13", p_locale: "en" });
    expect(r.error).not.toBeNull();
  });
});

describe("finalize_oauth_signup with a client invite", () => {
  it("links the client, makes them role=client and archives the auto-created workspace", async () => {
    const { token, clientId } = await createInvite(coach.client, coach.userId);
    const g = await googleUser("client");

    const r = await g.client.rpc("finalize_oauth_signup", {
      p_terms_version: "2026-10-13",
      p_locale: "ar",
      p_invite_token: token,
    });
    expect(r.error).toBeNull();

    expect((await profileOf(g.userId)).role).toBe("client");
    const linked = await rlsAdmin.from("clients").select("profile_id, status").eq("id", clientId).single();
    expect(linked.data).toMatchObject({ profile_id: g.userId, status: "active" });
    const ws = await rlsAdmin.from("coaches").select("archived_at").eq("id", g.userId).single();
    expect(ws.data?.archived_at).not.toBeNull();
  });

  it("rejects an unknown token and rolls everything back (terms stay unset)", async () => {
    const g = await googleUser("badtoken");
    const r = await g.client.rpc("finalize_oauth_signup", {
      p_terms_version: "2026-10-13",
      p_locale: "ar",
      p_invite_token: "not-a-real-token-xxxxxxxx",
    });
    expect(r.error).not.toBeNull();
    expect(await profileOf(g.userId)).toMatchObject({ role: "coach", terms_accepted_at: null });
  });

  it("rejects an already-used invite", async () => {
    const { token } = await createInvite(coach.client, coach.userId);
    const first = await googleUser("used1");
    expect((await first.client.rpc("finalize_oauth_signup", { p_terms_version: "2026-10-13", p_locale: "ar", p_invite_token: token })).error).toBeNull();

    const second = await googleUser("used2");
    const r = await second.client.rpc("finalize_oauth_signup", { p_terms_version: "2026-10-13", p_locale: "ar", p_invite_token: token });
    expect(r.error).not.toBeNull();
    expect((await profileOf(second.userId)).role).toBe("coach");
  });
});

describe("existing email account", () => {
  it("a second user with the same email is refused (no duplicate account)", async () => {
    const email = uniqueEmail("dup");
    const first = await rlsAdmin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    expect(first.error).toBeNull();
    trackRlsUser(first.data.user!.id);

    const second = await rlsAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { provider: "google", providers: ["google"] },
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.code).toBe("email_exists");
  });
});
