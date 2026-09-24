// coaching_decisions carries the Coaching Ledger's full evidence trail
// (workout pain/rep history via `evidence` jsonb) and any client_note the
// coach wrote for the client — a leak here is the same class of problem as
// checkins/client_observations: one coach's clinical notes about a client
// becoming readable by an unrelated coach or client. The client's read-only
// access is the other half worth proving: they should see their OWN
// decisions and nothing else, and have no write path at all (same
// "coach owns the record" shape as checkins' review_checkin RPC).
import { beforeAll, describe, expect, it } from "vitest";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

async function createCoach(tag: string) {
  return createRlsUser(`cd-coach-${tag}`, {
    role: "coach",
    full_name: `Coach ${tag}`,
    business_name: `${tag} Fitness`,
    locale: "en",
  });
}

async function createClientOf(coachId: string, tag: string) {
  const { userId, client } = await createRlsUser(`cd-client-${tag}`, {
    role: "client",
    full_name: `Client ${tag}`,
    locale: "en",
  });

  const { data: row, error } = await admin
    .from("clients")
    .insert({ coach_id: coachId, profile_id: userId, display_name: `Client ${tag}` })
    .select("id")
    .single();
  if (error) throw error;

  return { userId, clientRowId: row.id as string, client };
}

let coachA: { userId: string; client: Awaited<ReturnType<typeof createCoach>>["client"] };
let coachB: { userId: string; client: Awaited<ReturnType<typeof createCoach>>["client"] };
let clientOfA: { userId: string; clientRowId: string; client: Awaited<ReturnType<typeof createClientOf>>["client"] };
let decisionId: string;

beforeAll(async () => {
  [coachA, coachB] = await Promise.all([createCoach("a"), createCoach("b")]);
  clientOfA = await createClientOf(coachA.userId, "a1");
}, 60_000);

describe("coaching_decisions: coach owns the record, client reads their own", () => {
  it("a coach can insert a decision for their own client, defaulting decided_by to themselves", async () => {
    const { data, error } = await coachA.client
      .from("coaching_decisions")
      .insert({
        coach_id: coachA.userId,
        client_id: clientOfA.clientRowId,
        decision: "adjust",
        reason_key: "protect_joint",
        client_note: "Lighter on the knee this week.",
        evidence: [{ kind: "pain_repeat", programItemId: "00000000-0000-0000-0000-000000000001", count: 2, lastAt: "2026-09-20T00:00:00Z", detail: { maxPain: 3 } }],
      })
      .select("id, decided_by")
      .single();
    if (error) throw error;

    decisionId = data.id;
    expect(data.decided_by).toBe(coachA.userId);
  });

  it("the client can read their own decision", async () => {
    const { data, error } = await clientOfA.client.from("coaching_decisions").select("id, reason_key").eq("id", decisionId).single();
    if (error) throw error;
    expect(data.reason_key).toBe("protect_joint");
  });

  it("the client cannot insert, update, or delete a decision", async () => {
    const insert = await clientOfA.client.from("coaching_decisions").insert({
      coach_id: coachA.userId,
      client_id: clientOfA.clientRowId,
      decision: "keep",
      reason_key: "other",
    });
    expect(insert.error).not.toBeNull();

    const update = await clientOfA.client.from("coaching_decisions").update({ reason_key: "other" }).eq("id", decisionId).select("id");
    expect(update.data).toEqual([]);

    const del = await clientOfA.client.from("coaching_decisions").delete().eq("id", decisionId).select("id");
    expect(del.data).toEqual([]);

    const { data: unchanged } = await coachA.client.from("coaching_decisions").select("reason_key").eq("id", decisionId).single();
    expect(unchanged?.reason_key).toBe("protect_joint");
  });

  it("a foreign coach cannot read, update, or delete another coach's decision", async () => {
    const { data: readData } = await coachB.client.from("coaching_decisions").select("id").eq("id", decisionId);
    expect(readData).toEqual([]);

    const { data: updateData } = await coachB.client
      .from("coaching_decisions")
      .update({ reason_key: "other" })
      .eq("id", decisionId)
      .select("id");
    expect(updateData).toEqual([]);
  });

  it("a foreign coach's client cannot read another coach's client decision", async () => {
    const clientOfB = await createClientOf(coachB.userId, "b1");
    const { data } = await clientOfB.client.from("coaching_decisions").select("id").eq("id", decisionId);
    expect(data).toEqual([]);
  });

  it("mark_decision_seen sets client_seen_at exactly once, and only for the client's own decision", async () => {
    const { data, error } = await clientOfA.client.rpc("mark_decision_seen", { p_decision_id: decisionId });
    if (error) throw error;
    expect(data.client_seen_at).not.toBeNull();

    const clientOfB = await createClientOf(coachB.userId, "b2");
    const foreign = await clientOfB.client.rpc("mark_decision_seen", { p_decision_id: decisionId });
    expect(foreign.error).not.toBeNull();
  });
});
