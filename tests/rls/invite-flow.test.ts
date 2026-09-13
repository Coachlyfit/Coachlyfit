// Exercises the actual mechanism Phase 3 introduces: a coach creates an
// invite, an anonymous signer-upper accepts it via accept_invite(), and the
// resulting client is scoped exactly like any other tenant data. Complements
// tests/rls/isolation.test.ts (which covers table-level RLS in general).
import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { createRlsUser, trackRlsUser } from "./rls-test-helpers";

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

  return { token, clientId: clientRow.id as string };
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
    const { token, clientId } = await createInvite(coachA.client, coachA.userId, "Karim");

    const email = `invited-client-${Date.now()}@example.test`;
    const password = "correct horse battery staple";
    const newClient = anonClient();
    const signUp = await newClient.auth.signUp({
      email,
      password,
      options: { data: { role: "client", full_name: "Karim", locale: "ar" } },
    });
    if (signUp.data.user) trackRlsUser(signUp.data.user.id);
    expect(signUp.error).toBeNull();
    expect(signUp.data.session).not.toBeNull(); // confirmations off locally

    const accept = await newClient.rpc("accept_invite", { p_token: token });
    expect(accept.error).toBeNull();
    expect(accept.data).toMatchObject({ coach_id: coachA.userId, client_id: clientId });

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
    const { token } = await createInvite(coachA.client, coachA.userId, "Nour");

    const first = anonClient();
    const firstSignUp = await first.auth.signUp({
      email: `nour-${Date.now()}@example.test`,
      password: "correct horse battery staple",
      options: { data: { role: "client", full_name: "Nour", locale: "ar" } },
    });
    if (firstSignUp.data.user) trackRlsUser(firstSignUp.data.user.id);
    const firstAccept = await first.rpc("accept_invite", { p_token: token });
    expect(firstAccept.error).toBeNull();

    const second = anonClient();
    const secondSignUp = await second.auth.signUp({
      email: `nour-2nd-${Date.now()}@example.test`,
      password: "correct horse battery staple",
      options: { data: { role: "client", full_name: "Nour Impostor", locale: "ar" } },
    });
    if (secondSignUp.data.user) trackRlsUser(secondSignUp.data.user.id);
    const secondAccept = await second.rpc("accept_invite", { p_token: token });
    expect(secondAccept.error).not.toBeNull();
  });
});
