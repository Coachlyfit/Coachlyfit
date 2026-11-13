// Programs and the client training loop denormalize coach_id AND client_id
// onto every child table down to program_item_sets and workout_set_logs
// (see 20260731000008_plans.sql's header comment) so every policy is a
// flat column comparison. That denormalization is only as safe as this
// suite proves it to be — a bug that lets a coach's own child insert carry
// the wrong client_id, or that lets a foreign coach read a client's
// program tree, leaks a client's entire training history across tenants.
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database, Json } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

async function createCoach(tag: string) {
  return createRlsUser(`pw-coach-${tag}`, {
    role: "coach",
    full_name: `Coach ${tag}`,
    business_name: `${tag} Fitness`,
    locale: "en",
  });
}

async function createClientOf(coachId: string, tag: string) {
  const { userId, client } = await createRlsUser(`pw-client-${tag}`, {
    role: "client",
    full_name: `Client ${tag}`,
    locale: "en",
  });

  const { data: row, error: rowError } = await admin
    .from("clients")
    .insert({ coach_id: coachId, profile_id: userId, display_name: `Client ${tag}` })
    .select("id")
    .single();
  if (rowError) throw rowError;

  return { userId, clientRowId: row.id as string, client };
}

/** Full program tree via the coach's own RLS-scoped client, exactly the
 * child-insert-re-reads-parent pattern ProgramsService follows — so a bug
 * in that derivation would fail here the same way it would in the app. */
async function buildProgramTree(
  coachClient: SupabaseClient<Database>,
  coachId: string,
  clientId: string
) {
  const { data: program, error: programError } = await coachClient
    .from("programs")
    .insert({ coach_id: coachId, client_id: clientId, name_ar: "برنامج", name_en: "Program" })
    .select("id")
    .single();
  if (programError) throw programError;

  const { data: day, error: dayError } = await coachClient
    .from("program_days")
    .insert({ coach_id: coachId, client_id: clientId, program_id: program.id, day_index: 1 })
    .select("id")
    .single();
  if (dayError) throw dayError;

  const { data: exercise, error: exerciseError } = await admin
    .from("exercises")
    .insert({ coach_id: coachId, name_ar: "تمرين", name_en: "Exercise" })
    .select("id")
    .single();
  if (exerciseError) throw exerciseError;

  const { data: item, error: itemError } = await coachClient
    .from("program_items")
    .insert({ coach_id: coachId, client_id: clientId, program_day_id: day.id, exercise_id: exercise.id })
    .select("id")
    .single();
  if (itemError) throw itemError;

  const { data: set, error: setError } = await coachClient
    .from("program_item_sets")
    .insert({ coach_id: coachId, client_id: clientId, program_item_id: item.id, set_index: 1, reps: 10 })
    .select("id")
    .single();
  if (setError) throw setError;

  return { programId: program.id as string, dayId: day.id as string, itemId: item.id as string, setId: set.id as string };
}

let coachA: { userId: string; client: SupabaseClient<Database> };
let coachB: { userId: string; client: SupabaseClient<Database> };
let clientOfA: { userId: string; clientRowId: string; client: SupabaseClient<Database> };
let tree: { programId: string; dayId: string; itemId: string; setId: string };

beforeAll(async () => {
  [coachA, coachB] = await Promise.all([createCoach("a"), createCoach("b")]);
  clientOfA = await createClientOf(coachA.userId, "a1");
  tree = await buildProgramTree(coachA.client, coachA.userId, clientOfA.clientRowId);
}, 60_000);

describe("programs tree: cross-coach isolation", () => {
  it("a foreign coach cannot read another coach's program", async () => {
    const { data } = await coachB.client.from("programs").select("id").eq("id", tree.programId);
    expect(data).toEqual([]);
  });

  it("a foreign coach cannot read another coach's program_days/program_items/program_item_sets", async () => {
    const [days, items, sets] = await Promise.all([
      coachB.client.from("program_days").select("id").eq("id", tree.dayId),
      coachB.client.from("program_items").select("id").eq("id", tree.itemId),
      coachB.client.from("program_item_sets").select("id").eq("id", tree.setId),
    ]);
    expect(days.data).toEqual([]);
    expect(items.data).toEqual([]);
    expect(sets.data).toEqual([]);
  });

  it("a foreign coach cannot delete another coach's program", async () => {
    const { data } = await coachB.client.from("programs").delete().eq("id", tree.programId).select("id");
    expect(data).toEqual([]);

    const { data: stillThere } = await coachA.client.from("programs").select("id").eq("id", tree.programId);
    expect(stillThere).toHaveLength(1);
  });

  it("a coach cannot write a program_item onto a day using a client_id from a different coach's roster", async () => {
    const clientOfB = await createClientOf(coachB.userId, "b1");
    const { error } = await coachB.client
      .from("program_days")
      .update({ client_id: clientOfA.clientRowId })
      .eq("id", tree.dayId);
    // Zero rows matched (RLS already hid the row), not a cross-tenant
    // write succeeding.
    expect(error).toBeNull();
    const { data: unchanged } = await coachA.client
      .from("program_days")
      .select("client_id")
      .eq("id", tree.dayId)
      .single();
    expect(unchanged?.client_id).toBe(clientOfA.clientRowId);
    void clientOfB;
  });
});

describe("templates: client_id is null, invisible to the client it would otherwise belong to", () => {
  it("a template (client_id null) never appears in a client's own program read", async () => {
    const { data: template, error } = await coachA.client
      .from("programs")
      .insert({ coach_id: coachA.userId, client_id: null, name_ar: "قالب", name_en: "Template" })
      .select("id")
      .single();
    if (error) throw error;

    const { data } = await clientOfA.client.from("programs").select("id").eq("id", template.id);
    expect(data).toEqual([]);
  });
});

describe("workout sessions & set logs: client owns, coach reads", () => {
  let sessionId: string;

  it("a client can start a session and log a set on their own assigned item", async () => {
    const { data: session, error: sessionError } = await clientOfA.client
      .from("workout_sessions")
      .insert({ coach_id: coachA.userId, client_id: clientOfA.clientRowId, program_day_id: tree.dayId })
      .select("id")
      .single();
    if (sessionError) throw sessionError;
    sessionId = session.id;

    const { data: log, error: logError } = await clientOfA.client
      .from("workout_set_logs")
      .insert({
        coach_id: coachA.userId,
        client_id: clientOfA.clientRowId,
        session_id: sessionId,
        program_item_id: tree.itemId,
        set_index: 1,
        weight: 60,
        reps: 8,
      })
      .select("id");
    if (logError) throw logError;
    expect(log).toHaveLength(1);
  });

  it("the owning coach can read the session and its set logs", async () => {
    const { data: session } = await coachA.client.from("workout_sessions").select("id").eq("id", sessionId);
    expect(session).toHaveLength(1);

    const { data: logs } = await coachA.client.from("workout_set_logs").select("id").eq("session_id", sessionId);
    expect(logs).toHaveLength(1);
  });

  it("a foreign coach cannot read the session or its set logs", async () => {
    const { data: session } = await coachB.client.from("workout_sessions").select("id").eq("id", sessionId);
    expect(session).toEqual([]);

    const { data: logs } = await coachB.client.from("workout_set_logs").select("id").eq("session_id", sessionId);
    expect(logs).toEqual([]);
  });

  it("exercise_id is stamped from the prescription, never trusted from the client", async () => {
    const { data: item } = await admin.from("program_items").select("exercise_id").eq("id", tree.itemId).single();
    const { data: other, error: otherError } = await admin
      .from("exercises")
      .insert({ coach_id: coachA.userId, name_ar: "آخر", name_en: "Other" })
      .select("id")
      .single();
    if (otherError) throw otherError;

    const { data: log, error } = await clientOfA.client
      .from("workout_set_logs")
      .insert({
        coach_id: coachA.userId,
        client_id: clientOfA.clientRowId,
        session_id: sessionId,
        program_item_id: tree.itemId,
        set_index: 3,
        weight: 70,
        reps: 5,
        exercise_id: other.id, // forged: the trigger must overwrite it
      })
      .select("exercise_id")
      .single();
    if (error) throw error;
    expect(log.exercise_id).toBe(item!.exercise_id);
  });

  it("exercise_bests: the owning coach sees the best set, a foreign coach sees nothing", async () => {
    const args = { p_client_id: clientOfA.clientRowId };
    const { data: mine, error } = await coachA.client.rpc("exercise_bests", args);
    if (error) throw error;
    expect(mine).toHaveLength(1);
    expect(mine![0]).toMatchObject({ best_weight: 70, best_reps: 5, set_count: 2 });

    const { data: theirs } = await coachB.client.rpc("exercise_bests", args);
    expect(theirs).toEqual([]);
  });

  it("the coach cannot write into the client's set logs — read-only by design", async () => {
    const { data } = await coachA.client
      .from("workout_set_logs")
      .insert({
        coach_id: coachA.userId,
        client_id: clientOfA.clientRowId,
        session_id: sessionId,
        program_item_id: tree.itemId,
        set_index: 2,
        weight: 60,
        reps: 8,
      })
      .select("id");
    expect(data).toBeNull();
  });
});

describe("workout_set_logs: 7-day immutability window", () => {
  let recentLogId: string;
  let staleLogId: string;

  it("a client can edit a set logged just now", async () => {
    const session = await clientOfA.client
      .from("workout_sessions")
      .insert({ coach_id: coachA.userId, client_id: clientOfA.clientRowId, program_day_id: tree.dayId })
      .select("id")
      .single();
    if (session.error) throw session.error;

    const { data: log, error: logError } = await clientOfA.client
      .from("workout_set_logs")
      .insert({
        coach_id: coachA.userId,
        client_id: clientOfA.clientRowId,
        session_id: session.data.id,
        program_item_id: tree.itemId,
        set_index: 10,
        weight: 50,
        reps: 5,
      })
      .select("id")
      .single();
    if (logError) throw logError;
    recentLogId = log.id;

    const { error: updateError } = await clientOfA.client
      .from("workout_set_logs")
      .update({ weight: 55 })
      .eq("id", recentLogId);
    expect(updateError).toBeNull();
  });

  it("a client cannot edit or delete a set logged more than 7 days ago", async () => {
    const session = await clientOfA.client
      .from("workout_sessions")
      .insert({ coach_id: coachA.userId, client_id: clientOfA.clientRowId, program_day_id: tree.dayId })
      .select("id")
      .single();
    if (session.error) throw session.error;

    const { data: log, error: logError } = await clientOfA.client
      .from("workout_set_logs")
      .insert({
        coach_id: coachA.userId,
        client_id: clientOfA.clientRowId,
        session_id: session.data.id,
        program_item_id: tree.itemId,
        set_index: 11,
        weight: 50,
        reps: 5,
      })
      .select("id")
      .single();
    if (logError) throw logError;
    staleLogId = log.id;

    // Backdate via the service-role client — the trigger has no
    // service_role exemption, but this write happens BEFORE the row is
    // "old", so it succeeds; the client's subsequent edit is what the
    // trigger evaluates against the now-backdated completed_at.
    const backdate = await admin
      .from("workout_set_logs")
      .update({ completed_at: new Date(Date.now() - 8 * 86_400_000).toISOString() })
      .eq("id", staleLogId);
    expect(backdate.error).toBeNull();

    const { error: updateError } = await clientOfA.client
      .from("workout_set_logs")
      .update({ weight: 999 })
      .eq("id", staleLogId);
    expect(updateError).not.toBeNull();
    expect(updateError?.code).toBe("42501");

    const { error: deleteError } = await clientOfA.client.from("workout_set_logs").delete().eq("id", staleLogId);
    expect(deleteError).not.toBeNull();
    expect(deleteError?.code).toBe("42501");
  });
});

// Offline sync (src/lib/offline): a set is logged on-device with a
// client-generated uuid + client_logged_at and upserted later. Retries must
// never duplicate, and the client_own policy must still keep one client's
// rows out of reach of another.
describe("workout_set_logs: offline-synced rows (client-generated id)", () => {
  let sessionId: string;
  let otherClient: { userId: string; clientRowId: string; client: SupabaseClient<Database> };
  const setId = crypto.randomUUID();
  const loggedAt = new Date(Date.now() - 3_600_000).toISOString();

  beforeAll(async () => {
    const { data: session, error } = await clientOfA.client
      .from("workout_sessions")
      .insert({ coach_id: coachA.userId, client_id: clientOfA.clientRowId, program_day_id: tree.dayId })
      .select("id")
      .single();
    if (error) throw error;
    sessionId = session.id;
    otherClient = await createClientOf(coachA.userId, "a2");
  }, 60_000);

  const row = () => ({
    id: setId,
    coach_id: coachA.userId,
    client_id: clientOfA.clientRowId,
    session_id: sessionId,
    program_item_id: tree.itemId,
    set_index: 1,
    weight: 40,
    reps: 10,
    client_logged_at: loggedAt,
    completed_at: loggedAt,
  });

  it("a client can upsert a set with their own uuid, and replaying the sync leaves exactly one row", async () => {
    const opts = { onConflict: "session_id,program_item_id,set_index" };
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await clientOfA.client.from("workout_set_logs").upsert(row(), opts);
      if (error) throw error;
    }
    const { data } = await clientOfA.client.from("workout_set_logs").select("id, client_logged_at").eq("session_id", sessionId);
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(setId);
    expect(new Date(data![0].client_logged_at!).toISOString()).toBe(loggedAt);
  });

  it("another client can neither read that row nor overwrite it by reusing its id", async () => {
    const { data: seen } = await otherClient.client.from("workout_set_logs").select("id").eq("id", setId);
    expect(seen).toEqual([]);

    const { error } = await otherClient.client
      .from("workout_set_logs")
      .upsert({ ...row(), client_id: otherClient.clientRowId, weight: 999 }, { onConflict: "id" });
    expect(error).not.toBeNull();

    const { data: still } = await admin.from("workout_set_logs").select("weight, client_id").eq("id", setId).single();
    expect(still).toMatchObject({ weight: 40, client_id: clientOfA.clientRowId });
  });

  it("another client cannot attribute a set to client A's client_id", async () => {
    const { error } = await otherClient.client
      .from("workout_set_logs")
      .insert({ ...row(), id: crypto.randomUUID(), set_index: 2 });
    expect(error).not.toBeNull();
  });
});

// 20261114000004: the coach-only note lives in its own table because RLS can
// hide rows but not a column — a client could `select coach_note_private`
// straight off program_items. Needs that migration applied.
describe("program_item_notes: coach-only private note", () => {
  const note = "watch the left knee";

  it("the owning coach can write and read their note", async () => {
    const { error } = await coachA.client
      .from("program_item_notes")
      .upsert({ program_item_id: tree.itemId, coach_id: coachA.userId, note }, { onConflict: "program_item_id" });
    expect(error).toBeNull();
    const { data } = await coachA.client.from("program_item_notes").select("note").eq("program_item_id", tree.itemId);
    expect(data).toEqual([{ note }]);
  });

  it("the assigned client sees the item but can never read the note", async () => {
    const { data: items } = await clientOfA.client.from("program_items").select("id").eq("id", tree.itemId);
    expect(items).toHaveLength(1);
    const { data } = await clientOfA.client.from("program_item_notes").select("note").eq("program_item_id", tree.itemId);
    expect(data ?? []).toEqual([]);
  });

  it("a foreign coach can neither read the note nor write one onto someone else's item", async () => {
    const { data } = await coachB.client.from("program_item_notes").select("note").eq("program_item_id", tree.itemId);
    expect(data ?? []).toEqual([]);
    const { error } = await coachB.client
      .from("program_item_notes")
      .upsert({ program_item_id: tree.itemId, coach_id: coachB.userId, note: "hijack" }, { onConflict: "program_item_id" });
    expect(error).not.toBeNull();
  });

  it("a client cannot write a note either", async () => {
    const { error } = await clientOfA.client
      .from("program_item_notes")
      .upsert({ program_item_id: tree.itemId, coach_id: coachA.userId, note: "client note" }, { onConflict: "program_item_id" });
    expect(error).not.toBeNull();
  });
});

describe("replace_program_item_sets: atomic, RLS-scoped", () => {
  const rpc = (c: SupabaseClient<Database>, sets: object[]) =>
    c.rpc("replace_program_item_sets", {
      p_item_id: tree.itemId,
      p_sets: sets as Json,
      p_legacy: { sets: sets.length, reps: "8", rest_seconds: null },
    });

  it("replaces the owner's sets in order and updates the legacy snapshot", async () => {
    const { data, error } = await rpc(coachA.client, [
      { reps: 8, weight: 60, set_type: "warmup" },
      { reps: 5, reps_max: 6, pct_1rm: 80, rpe_target: 8, set_type: "working" },
    ]);
    expect(error).toBeNull();
    expect(data).toBe(true);
    const { data: sets } = await admin
      .from("program_item_sets")
      .select("set_index, reps, set_type, pct_1rm, coach_id, client_id")
      .eq("program_item_id", tree.itemId)
      .order("set_index");
    expect(sets).toEqual([
      expect.objectContaining({ set_index: 1, reps: 8, set_type: "warmup", coach_id: coachA.userId, client_id: clientOfA.clientRowId }),
      expect.objectContaining({ set_index: 2, reps: 5, set_type: "working", pct_1rm: 80 }),
    ]);
  });

  it("a foreign coach gets false, and the client is refused by RLS — either way nothing changes", async () => {
    // The item is invisible to a foreign coach: a clean `false`.
    expect((await rpc(coachB.client, [{ reps: 99 }])).data).toBe(false);
    // The client can see the item but has no write policy: the insert is
    // rejected and the whole call (including its earlier delete) rolls back.
    expect((await rpc(clientOfA.client, [{ reps: 99 }])).error).not.toBeNull();
    const { data: sets } = await admin.from("program_item_sets").select("reps").eq("program_item_id", tree.itemId);
    expect(sets).toHaveLength(2);
    expect(sets!.every((s) => s.reps !== 99)).toBe(true);
  });
});
