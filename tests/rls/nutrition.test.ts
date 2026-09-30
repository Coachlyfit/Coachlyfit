// Nutrition tracking (20261001000001_nutrition_tracking.sql): clients own
// their intake logs and reminder settings; the active coach reads logs
// (by relationship, like checkins) and reads/writes the body profile;
// nobody else sees any of it. An off-plan report notifies the active coach.
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { createRlsUser, rlsAdmin } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

let coachA: User;
let coachB: User;
let client: User;
let otherClient: User;
let clientId: string;
let clientEmail: string;

async function createCoach(tag: string) {
  return createRlsUser(`nutrition-coach-${tag}`, {
    role: "coach",
    full_name: `Coach ${tag}`,
    business_name: `${tag} Gym`,
    locale: "en",
  });
}

// Same shape as InvitesService.createInvite + the signup-trigger link.
async function inviteClient(coach: User, tag: string) {
  const { data: row, error } = await coach.client
    .from("clients")
    .insert({ coach_id: coach.userId, display_name: `Client ${tag}` })
    .select("id")
    .single();
  if (error) throw error;
  const tokenHash = createHash("sha256").update(randomBytes(24).toString("base64url")).digest("hex");
  const invite = await coach.client
    .from("invites")
    .insert({ coach_id: coach.userId, client_id: row.id, token_hash: tokenHash });
  if (invite.error) throw invite.error;
  const user = await createRlsUser(`nutrition-client-${tag}`, {
    role: "client",
    full_name: `Client ${tag}`,
    locale: "en",
    invite_token_hash: tokenHash,
  });
  return { id: row.id, user };
}

async function logDatesSeenBy(user: User) {
  const { data, error } = await user.client.from("nutrition_logs").select("log_date").eq("client_id", clientId);
  if (error) throw error;
  return data.map((r) => r.log_date).sort();
}

async function offPlanNotificationsFor(user: User) {
  const { data, error } = await user.client
    .from("notifications")
    .select("payload")
    .eq("kind", "off_plan_reported");
  if (error) throw error;
  return data.map((n) => (n.payload as { client_id: string; log_date: string }).log_date);
}

beforeAll(async () => {
  [coachA, coachB] = await Promise.all([createCoach("a"), createCoach("b")]);
  const [mine, other] = await Promise.all([inviteClient(coachA, "mine"), inviteClient(coachB, "other")]);
  clientId = mine.id;
  client = mine.user;
  otherClient = other.user;
  const { data: authUser } = await rlsAdmin.auth.admin.getUserById(client.userId);
  clientEmail = authUser.user!.email!;
}, 60_000);

describe("nutrition logs", () => {
  it("the client logs their own intake; only their active coach can read it", async () => {
    const { error } = await client.client
      .from("nutrition_logs")
      .insert({ coach_id: coachA.userId, client_id: clientId, log_date: "2026-01-01", kcal: 2100, protein_g: 150 });
    expect(error).toBeNull();

    expect(await logDatesSeenBy(client)).toEqual(["2026-01-01"]);
    expect(await logDatesSeenBy(coachA)).toEqual(["2026-01-01"]);
    expect(await logDatesSeenBy(coachB)).toEqual([]);
    expect(await logDatesSeenBy(otherClient)).toEqual([]);
  });

  it("a coach can't write a client's log", async () => {
    const insert = await coachA.client
      .from("nutrition_logs")
      .insert({ coach_id: coachA.userId, client_id: clientId, log_date: "2026-01-02", kcal: 1 });
    expect(insert.error).not.toBeNull();

    const update = await coachA.client
      .from("nutrition_logs")
      .update({ kcal: 1 })
      .eq("client_id", clientId)
      .select("id");
    expect(update.data).toEqual([]);
  });

  it("another client can't log into someone else's history", async () => {
    const { error } = await otherClient.client
      .from("nutrition_logs")
      .insert({ coach_id: coachA.userId, client_id: clientId, log_date: "2026-01-03", kcal: 1 });
    expect(error).not.toBeNull();
  });

  it("an off-plan report notifies the active coach only", async () => {
    // Flip the already-logged day to off-plan (the update path of the trigger).
    const { error } = await client.client
      .from("nutrition_logs")
      .update({ off_plan: true, off_plan_meal: "Dinner", off_plan_kcal: 900 })
      .eq("client_id", clientId)
      .eq("log_date", "2026-01-01");
    expect(error).toBeNull();

    expect(await offPlanNotificationsFor(coachA)).toEqual(["2026-01-01"]);
    expect(await offPlanNotificationsFor(coachB)).toEqual([]);

    // Re-saving an off-plan day doesn't notify again.
    await client.client
      .from("nutrition_logs")
      .update({ off_plan_note: "birthday" })
      .eq("client_id", clientId)
      .eq("log_date", "2026-01-01");
    expect(await offPlanNotificationsFor(coachA)).toEqual(["2026-01-01"]);
  });

  it("a day needs kcal or an off-plan report", async () => {
    const { error } = await client.client
      .from("nutrition_logs")
      .insert({ coach_id: coachA.userId, client_id: clientId, log_date: "2026-01-04" });
    expect(error).not.toBeNull();
  });
});

describe("reminder settings", () => {
  it("only the client can read or write their reminder", async () => {
    const { error } = await client.client
      .from("nutrition_reminder_settings")
      .upsert({ client_id: clientId, enabled: true, remind_at: "20:30", timezone: "Africa/Cairo" });
    expect(error).toBeNull();

    const own = await client.client.from("nutrition_reminder_settings").select("remind_at").eq("client_id", clientId);
    expect(own.data).toEqual([{ remind_at: "20:30:00" }]);

    for (const other of [coachA, coachB, otherClient]) {
      const seen = await other.client.from("nutrition_reminder_settings").select("client_id").eq("client_id", clientId);
      expect(seen.data).toEqual([]);
    }

    const coachWrite = await coachA.client
      .from("nutrition_reminder_settings")
      .update({ enabled: false })
      .eq("client_id", clientId)
      .select("client_id");
    expect(coachWrite.data).toEqual([]);
  });
});

describe("body profile", () => {
  it("the client and their active coach can both edit it; nobody else can see it", async () => {
    const byClient = await client.client
      .from("client_body_profiles")
      .upsert({ client_id: clientId, height_cm: 170, sex: "female" });
    expect(byClient.error).toBeNull();

    const byCoach = await coachA.client
      .from("client_body_profiles")
      .update({ goal: "cut", activity_level: "moderate" })
      .eq("client_id", clientId)
      .select("goal");
    expect(byCoach.data).toEqual([{ goal: "cut" }]);

    for (const other of [coachB, otherClient]) {
      const seen = await other.client.from("client_body_profiles").select("client_id").eq("client_id", clientId);
      expect(seen.data).toEqual([]);
    }
    const coachBWrite = await coachB.client
      .from("client_body_profiles")
      .update({ goal: "bulk" })
      .eq("client_id", clientId)
      .select("goal");
    expect(coachBWrite.data).toEqual([]);
  });
});

describe("after switching coach (history not shared)", () => {
  beforeAll(async () => {
    const { data: relationshipId, error } = await coachB.client.rpc("link_existing_client", { p_email: clientEmail });
    if (error) throw error;
    const respond = await client.client.rpc("respond_to_coach_invite", {
      p_relationship_id: relationshipId!,
      p_accept: true,
      p_share_history: false,
    });
    if (respond.error) throw respond.error;
  }, 30_000);

  it("the old coach loses the logs and the body profile; the new coach sees only the new era", async () => {
    expect(await logDatesSeenBy(coachA)).toEqual([]);
    expect(await logDatesSeenBy(coachB)).toEqual([]);

    const { error } = await client.client
      .from("nutrition_logs")
      .insert({ coach_id: coachB.userId, client_id: clientId, log_date: "2026-02-01", kcal: 1900 });
    expect(error).toBeNull();
    expect(await logDatesSeenBy(coachB)).toEqual(["2026-02-01"]);
    expect(await logDatesSeenBy(coachA)).toEqual([]);
    expect(await logDatesSeenBy(client)).toEqual(["2026-01-01", "2026-02-01"]);

    const oldCoach = await coachA.client.from("client_body_profiles").select("client_id").eq("client_id", clientId);
    expect(oldCoach.data).toEqual([]);
    const newCoach = await coachB.client.from("client_body_profiles").select("goal").eq("client_id", clientId);
    expect(newCoach.data).toEqual([{ goal: "cut" }]);
  });

  it("a new off-plan report goes to the new coach", async () => {
    const { error } = await client.client
      .from("nutrition_logs")
      .update({ off_plan: true })
      .eq("client_id", clientId)
      .eq("log_date", "2026-02-01");
    expect(error).toBeNull();
    expect(await offPlanNotificationsFor(coachB)).toEqual(["2026-02-01"]);
    expect(await offPlanNotificationsFor(coachA)).toEqual(["2026-01-01"]);
  });
});
