// Coach switching (20260930000004_coaching_relationships.sql): a client with
// an account under coach A is invited by coach B, accepts, and access moves
// with the relationship: A loses the client's data (but keeps reading what A
// owns), B sees only the new era unless the client shares history, and the
// client always sees everything of their own.
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { createRlsUser, rlsAdmin } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

let coachA: User;
let coachB: User;
let client: User;
let clientId: string;
let clientEmail: string;
let subscriptionId: string;

async function createCoach(tag: string) {
  return createRlsUser(`switch-coach-${tag}`, {
    role: "coach",
    full_name: `Coach ${tag}`,
    business_name: `${tag} Gym`,
    locale: "ar",
  });
}

// body_metrics is unique per (client, metric, day), so each log gets its own day.
async function logWeight(value: number, coachId: string, takenOn: string) {
  const { error } = await client.client
    .from("body_metrics")
    .insert({ coach_id: coachId, client_id: clientId, metric: "weight", value, unit: "kg", taken_on: takenOn });
  if (error) throw error;
}

async function weightsSeenBy(user: User) {
  const { data, error } = await user.client.from("body_metrics").select("value").eq("client_id", clientId);
  if (error) throw error;
  return data.map((r) => Number(r.value)).sort();
}

async function switchTo(coach: User, shareHistory: boolean) {
  const { data: relationshipId, error } = await coach.client.rpc("link_existing_client", { p_email: clientEmail });
  if (error) throw error;
  expect(relationshipId).toBeTruthy();
  const respond = await client.client.rpc("respond_to_coach_invite", {
    p_relationship_id: relationshipId!,
    p_accept: true,
    p_share_history: shareHistory,
  });
  if (respond.error) throw respond.error;
}

beforeAll(async () => {
  [coachA, coachB] = await Promise.all([createCoach("a"), createCoach("b")]);

  // Same shape as InvitesService.createInvite + the signup-trigger link.
  const { data: row, error } = await coachA.client
    .from("clients")
    .insert({ coach_id: coachA.userId, display_name: "Mona" })
    .select("id")
    .single();
  if (error) throw error;
  clientId = row.id;
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invite = await coachA.client
    .from("invites")
    .insert({ coach_id: coachA.userId, client_id: clientId, token_hash: tokenHash });
  if (invite.error) throw invite.error;

  client = await createRlsUser("switch-client", {
    role: "client",
    full_name: "Mona",
    locale: "ar",
    invite_token_hash: tokenHash,
  });
  const { data: authUser } = await rlsAdmin.auth.admin.getUserById(client.userId);
  clientEmail = authUser.user!.email!;

  await logWeight(80, coachA.userId, "2026-01-01");

  const pkg = await coachA.client
    .from("client_packages")
    .insert({ coach_id: coachA.userId, name_ar: "شهري", name_en: "Monthly", duration_days: 30, price_egp: 1000 })
    .select("id")
    .single();
  if (pkg.error) throw pkg.error;
  const sub = await coachA.client
    .from("client_subscriptions")
    .insert({ coach_id: coachA.userId, client_id: clientId, package_id: pkg.data.id, end_date: "2099-01-01" })
    .select("id")
    .single();
  if (sub.error) throw sub.error;
  subscriptionId = sub.data.id;

  const program = await coachA.client
    .from("programs")
    .insert({ coach_id: coachA.userId, client_id: clientId, name_ar: "برنامج", name_en: "Program A" });
  if (program.error) throw program.error;

  const message = await coachA.client
    .from("messages")
    .insert({ coach_id: coachA.userId, client_id: clientId, body: "hi", sender_role: "coach" });
  if (message.error) throw message.error;
}, 60_000);

describe("coach switching", () => {
  it("a pending coach sees nothing; the client sees who is inviting them", async () => {
    const { data: relationshipId, error } = await coachB.client.rpc("link_existing_client", {
      p_email: clientEmail,
    });
    expect(error).toBeNull();
    expect(relationshipId).toBeTruthy();

    // Re-inviting reuses the open invite instead of stacking rows.
    const again = await coachB.client.rpc("link_existing_client", { p_email: clientEmail });
    expect(again.data).toBe(relationshipId);

    expect(await weightsSeenBy(coachA)).toEqual([80]);
    expect(await weightsSeenBy(coachB)).toEqual([]);

    const pending = await client.client
      .from("coaching_relationships")
      .select("id, coaches(business_name)")
      .eq("status", "pending");
    expect(pending.data).toEqual([{ id: relationshipId, coaches: { business_name: "b Gym" } }]);

    // Unknown email -> null, so the caller falls back to a normal invite.
    const unknown = await coachB.client.rpc("link_existing_client", { p_email: "nobody@example.test" });
    expect(unknown.data).toBeNull();
  });

  it("inviting your own active client is rejected", async () => {
    const { error } = await coachA.client.rpc("link_existing_client", { p_email: clientEmail });
    expect(error?.message).toBe("already_your_client");
  });

  it("accepting without sharing: old coach loses client data, new coach sees only the new era", async () => {
    const { data: pending } = await client.client
      .from("coaching_relationships")
      .select("id")
      .eq("status", "pending")
      .single();
    const respond = await client.client.rpc("respond_to_coach_invite", {
      p_relationship_id: pending!.id,
      p_accept: true,
      p_share_history: false,
    });
    expect(respond.error).toBeNull();

    // Old coach: client data and the conversation are gone...
    expect(await weightsSeenBy(coachA)).toEqual([]);
    const oldMessages = await coachA.client.from("messages").select("id").eq("client_id", clientId);
    expect(oldMessages.data).toEqual([]);
    const oldRoster = await coachA.client.from("clients").select("id").eq("id", clientId);
    expect(oldRoster.data).toEqual([]);

    // ...A still reads what A owns, read-only...
    const ownPrograms = await coachA.client.from("programs").select("name_en").eq("client_id", clientId);
    expect(ownPrograms.data).toEqual([{ name_en: "Program A" }]);
    const write = await coachA.client
      .from("programs")
      .insert({ coach_id: coachA.userId, client_id: clientId, name_ar: "x", name_en: "Late write" });
    expect(write.error).not.toBeNull();

    // ...billing stopped, and A was told.
    const sub = await coachA.client.from("client_subscriptions").select("status").eq("id", subscriptionId).single();
    expect(sub.data?.status).toBe("canceled");
    const notes = await coachA.client.from("notifications").select("kind, payload").eq("kind", "client_left");
    expect(notes.data).toEqual([{ kind: "client_left", payload: { client_id: clientId, display_name: "Mona" } }]);

    // New coach: the client is on B's roster, history is not shared.
    const newRoster = await coachB.client.from("clients").select("id").eq("id", clientId);
    expect(newRoster.data).toHaveLength(1);
    expect(await weightsSeenBy(coachB)).toEqual([]);

    await logWeight(78, coachB.userId, "2026-02-01");
    expect(await weightsSeenBy(coachB)).toEqual([78]);
    expect(await weightsSeenBy(coachA)).toEqual([]);

    // The client keeps everything of their own, including A's program.
    expect(await weightsSeenBy(client)).toEqual([78, 80]);
    const clientPrograms = await client.client.from("programs").select("name_en").eq("client_id", clientId);
    expect(clientPrograms.data).toEqual([{ name_en: "Program A" }]);
  });

  it("switching back with share_history shows every earlier era and cuts off the previous coach", async () => {
    await switchTo(coachA, true);

    expect(await weightsSeenBy(coachA)).toEqual([78, 80]);
    expect(await weightsSeenBy(coachB)).toEqual([]);
  });

  it("declining leaves the current relationship untouched", async () => {
    const { data: relationshipId } = await coachB.client.rpc("link_existing_client", { p_email: clientEmail });
    const decline = await client.client.rpc("respond_to_coach_invite", {
      p_relationship_id: relationshipId!,
      p_accept: false,
      p_share_history: false,
    });
    expect(decline.error).toBeNull();

    expect(await weightsSeenBy(coachA)).toEqual([78, 80]);
    expect(await weightsSeenBy(coachB)).toEqual([]);

    // Already answered -> can't be accepted afterwards.
    const late = await client.client.rpc("respond_to_coach_invite", {
      p_relationship_id: relationshipId!,
      p_accept: true,
      p_share_history: false,
    });
    expect(late.error).not.toBeNull();
  });
});
