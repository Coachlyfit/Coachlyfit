// Programs and the client training loop denormalize coach_id AND client_id
// onto every child table down to program_item_sets and workout_set_logs
// (see 20260731000008_plans.sql's header comment) so every policy is a
// flat column comparison. That denormalization is only as safe as this
// suite proves it to be — a bug that lets a coach's own child insert carry
// the wrong client_id, or that lets a foreign coach read a client's
// program tree, leaks a client's entire training history across tenants.
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
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
