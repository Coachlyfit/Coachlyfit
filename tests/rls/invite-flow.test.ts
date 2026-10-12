// A coach creates an invite, an anonymous visitor signs up with the invite's
// token hash in the signup metadata, and handle_new_user() links them in the
// same transaction (20260922000001). The resulting client is scoped exactly
// like any other tenant data. Also covers what signup metadata must NOT be
// able to do (20261017000001): mint an admin, or a client with no invite.
// Complements tests/rls/isolation.test.ts (table-level RLS in general).
import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { createRlsUser, rlsAdmin, trackRlsUser } from "./rls-test-helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

function anonClient() {
  return createClient<Database>(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createCoach(tag: string) {
  return createRlsUser(`invite-coach-${tag}`, {
    role: "coach",
    full_name: `Coach ${tag}`,
    business_name: `${tag} Gym`,
    locale: "ar",
  });
}

/** Mirrors InvitesService.createInvite (src/domain/clients/invites.service.ts)
 * without importing Next.js/React-adjacent code into the test. */
async function createInvite(coach: SupabaseClient<Database>, coachId: string, displayName: string) {
  const { data: clientRow, error: clientError } = await coach
    .from("clients")
    .insert({ coach_id: coachId, display_name: displayName })
    .select("id")
    .single();
  if (clientError) throw clientError;

  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error: inviteError } = await coach
    .from("invites")
    .insert({ coach_id: coachId, client_id: clientRow.id, token_hash: tokenHash });
  if (inviteError) throw inviteError;

  return { token, tokenHash, clientId: clientRow.id as string };
}

const PASSWORD = "correct horse battery staple";
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;

async function roleOf(userId: string) {
  return (await rlsAdmin.from("profiles").select("role").eq("id", userId).single()).data?.role;
}

let coachA: { userId: string; client: SupabaseClient<Database> };
let coachB: { userId: string; client: SupabaseClient<Database> };

beforeAll(async () => {
  [coachA, coachB] = await Promise.all([createCoach("a"), createCoach("b")]);
}, 30_000);

describe("invite acceptance", () => {
  it("get_invite_info exposes only display fields for a valid token, nothing for an invalid one", async () => {
    const { token } = await createInvite(coachA.client, coachA.userId, "Fadwa");

    const visitor = anonClient();
    const valid = await visitor.rpc("get_invite_info", { p_token: token });
    expect(valid.data).toMatchObject({ valid: true, business_name: "a Gym", display_name: "Fadwa" });

    const invalid = await visitor.rpc("get_invite_info", { p_token: "not-a-real-token" });
    expect(invalid.data).toMatchObject({ valid: false });
  });

  it("accepting an invite links the new client to the inviting coach, isolated from other coaches", async () => {
    const { tokenHash, clientId } = await createInvite(coachA.client, coachA.userId, "Karim");

    const newClient = anonClient();
    const signUp = await newClient.auth.signUp({
      email: uniqueEmail("invited-client"),
      password: PASSWORD,
      options: { data: { role: "client", full_name: "Karim", locale: "ar", invite_token_hash: tokenHash } },
    });
    if (signUp.data.user) trackRlsUser(signUp.data.user.id);
    expect(signUp.error).toBeNull();
    expect(signUp.data.session).not.toBeNull(); // confirmations off locally
    expect(await roleOf(signUp.data.user!.id)).toBe("client");

    // The new client sees their own row and coach's business name...
    const ownRow = await newClient
      .from("clients")
      .select("id, status, coaches(business_name)")
      .eq("id", clientId)
      .single();
    expect(ownRow.data?.status).toBe("active");
    expect(ownRow.data?.coaches?.business_name).toBe("a Gym");

    // ...coach A sees them in their roster...
    const seenByOwnCoach = await coachA.client.from("clients").select("id").eq("id", clientId);
    expect(seenByOwnCoach.data).toHaveLength(1);

    // ...and coach B — a different tenant — sees nothing.
    const seenByOtherCoach = await coachB.client.from("clients").select("id").eq("id", clientId);
    expect(seenByOtherCoach.data).toEqual([]);
  });

  it("rejects reusing an already-accepted invite token", async () => {
    const { token, tokenHash } = await createInvite(coachA.client, coachA.userId, "Nour");

    const first = anonClient();
    const firstSignUp = await first.auth.signUp({
      email: uniqueEmail("nour"),
      password: PASSWORD,
      options: { data: { role: "client", full_name: "Nour", locale: "ar", invite_token_hash: tokenHash } },
    });
    if (firstSignUp.data.user) trackRlsUser(firstSignUp.data.user.id);
    expect(firstSignUp.error).toBeNull();

    // The same hash can't create a second client account...
    const second = anonClient();
    const secondSignUp = await second.auth.signUp({
      email: uniqueEmail("nour-2nd"),
      password: PASSWORD,
      options: { data: { role: "client", full_name: "Nour Impostor", locale: "ar", invite_token_hash: tokenHash } },
    });
    if (secondSignUp.data.user) trackRlsUser(secondSignUp.data.user.id);
    expect(secondSignUp.error).not.toBeNull();

    // ...and the plaintext token can't be replayed through accept_invite().
    const replay = await first.rpc("accept_invite", { p_token: token });
    expect(replay.error).not.toBeNull();
  });
});

describe("signup metadata can't grant a role", () => {
  it("ignores role: 'admin' and creates an ordinary coach", async () => {
    const visitor = anonClient();
    const signUp = await visitor.auth.signUp({
      email: uniqueEmail("wannabe-admin"),
      password: PASSWORD,
      options: { data: { role: "admin", full_name: "Mallory", locale: "en" } },
    });
    if (signUp.data.user) trackRlsUser(signUp.data.user.id);
    expect(signUp.error).toBeNull();
    expect(await roleOf(signUp.data.user!.id)).toBe("coach");

    // Not an admin as far as the database is concerned either.
    const adminOnly = await visitor.rpc("admin_list_coaches");
    expect(adminOnly.error).not.toBeNull();
  });

  it("falls back to coach for a role it doesn't know", async () => {
    const signUp = await anonClient().auth.signUp({
      email: uniqueEmail("odd-role"),
      password: PASSWORD,
      options: { data: { role: "superuser", full_name: "Odd", locale: "en" } },
    });
    if (signUp.data.user) trackRlsUser(signUp.data.user.id);
    expect(signUp.error).toBeNull();
    expect(await roleOf(signUp.data.user!.id)).toBe("coach");
  });

  it("rejects a client signup with no invite, or one that isn't open", async () => {
    const noInvite = await anonClient().auth.signUp({
      email: uniqueEmail("no-invite"),
      password: PASSWORD,
      options: { data: { role: "client", full_name: "Nobody", locale: "ar" } },
    });
    if (noInvite.data.user) trackRlsUser(noInvite.data.user.id);
    expect(noInvite.error).not.toBeNull();

    const badHash = await anonClient().auth.signUp({
      email: uniqueEmail("bad-invite"),
      password: PASSWORD,
      options: { data: { role: "client", full_name: "Nobody", locale: "ar", invite_token_hash: "not-a-real-hash" } },
    });
    if (badHash.data.user) trackRlsUser(badHash.data.user.id);
    expect(badHash.error).not.toBeNull();
  });
});
