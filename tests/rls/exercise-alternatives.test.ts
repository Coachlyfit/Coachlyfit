// exercise_alternatives is read by clients (swap sheet) and written by
// coaches, at two scopes: library-level (program_item_id null) and a
// per-program-item override. The override scope rides program_items' RLS, so
// these tests prove it neither leaks across coaches nor lets a coach attach
// an override to an item whose exercise doesn't match.
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

async function createCoach(tag: string) {
  return createRlsUser(`alt-coach-${tag}`, {
    role: "coach",
    full_name: `Coach ${tag}`,
    business_name: `${tag} Fitness`,
    locale: "en",
  });
}

async function createExercise(coachId: string, name: string) {
  const { data, error } = await admin
    .from("exercises")
    .insert({ coach_id: coachId, name_ar: name, name_en: name })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

let coachA: { userId: string; client: SupabaseClient<Database> };
let coachB: { userId: string; client: SupabaseClient<Database> };
let clientOfA: { client: SupabaseClient<Database> };
let exA1: string;
let exA2: string;
let exA3: string;
let exB1: string;
let itemId: string;

beforeAll(async () => {
  [coachA, coachB] = await Promise.all([createCoach("a"), createCoach("b")]);
  const { userId, client } = await createRlsUser("alt-client-a1", {
    role: "client",
    full_name: "Client a1",
    locale: "en",
  });
  const { data: clientRow, error: clientError } = await admin
    .from("clients")
    .insert({ coach_id: coachA.userId, profile_id: userId, display_name: "Client a1" })
    .select("id")
    .single();
  if (clientError) throw clientError;
  clientOfA = { client };

  [exA1, exA2, exA3, exB1] = await Promise.all([
    createExercise(coachA.userId, "A1"),
    createExercise(coachA.userId, "A2"),
    createExercise(coachA.userId, "A3"),
    createExercise(coachB.userId, "B1"),
  ]);

  const base = { coach_id: coachA.userId, client_id: clientRow.id as string };
  const { data: program, error: pe } = await coachA.client
    .from("programs")
    .insert({ ...base, name_ar: "برنامج", name_en: "Program" })
    .select("id")
    .single();
  if (pe) throw pe;
  const { data: day, error: de } = await coachA.client
    .from("program_days")
    .insert({ ...base, program_id: program.id, day_index: 1 })
    .select("id")
    .single();
  if (de) throw de;
  const { data: item, error: ie } = await coachA.client
    .from("program_items")
    .insert({ ...base, program_day_id: day.id, exercise_id: exA1 })
    .select("id")
    .single();
  if (ie) throw ie;
  itemId = item.id as string;
}, 60_000);

describe("exercise_alternatives: library-level", () => {
  it("a coach adds alternatives for their own exercises; their client reads them, a foreign coach does not", async () => {
    const { error } = await coachA.client.from("exercise_alternatives").insert({
      exercise_id: exA1,
      alternative_exercise_id: exA2,
      coach_id: coachA.userId,
      sort_order: 0,
    });
    expect(error).toBeNull();

    const own = await coachA.client.from("exercise_alternatives").select("id").eq("exercise_id", exA1);
    const asClient = await clientOfA.client.from("exercise_alternatives").select("id").eq("exercise_id", exA1);
    const foreign = await coachB.client.from("exercise_alternatives").select("id").eq("exercise_id", exA1);
    expect(own.data).toHaveLength(1);
    expect(asClient.data).toHaveLength(1);
    expect(foreign.data).toEqual([]);
  });

  it("rejects an alternative that points at another coach's private exercise", async () => {
    const { error } = await coachA.client.from("exercise_alternatives").insert({
      exercise_id: exA1,
      alternative_exercise_id: exB1,
      coach_id: coachA.userId,
    });
    expect(error).not.toBeNull();
  });

  it("rejects writing a row owned by someone else's coach_id", async () => {
    const { error } = await coachB.client.from("exercise_alternatives").insert({
      exercise_id: exA1,
      alternative_exercise_id: exA3,
      coach_id: coachA.userId,
    });
    expect(error).not.toBeNull();
  });

  it("rejects an exercise listed as its own alternative", async () => {
    const { error } = await coachA.client.from("exercise_alternatives").insert({
      exercise_id: exA1,
      alternative_exercise_id: exA1,
      coach_id: coachA.userId,
    });
    expect(error).not.toBeNull();
  });

  it("rejects a duplicate pair for the same coach", async () => {
    const { error } = await coachA.client.from("exercise_alternatives").insert({
      exercise_id: exA1,
      alternative_exercise_id: exA2,
      coach_id: coachA.userId,
    });
    expect(error).not.toBeNull();
  });

  it("a client cannot write alternatives", async () => {
    const { error } = await clientOfA.client.from("exercise_alternatives").insert({
      exercise_id: exA1,
      alternative_exercise_id: exA3,
      coach_id: coachA.userId,
    });
    expect(error).not.toBeNull();
  });

  it("a foreign coach cannot delete another coach's rows", async () => {
    const { data } = await coachB.client
      .from("exercise_alternatives")
      .delete()
      .eq("exercise_id", exA1)
      .select("id");
    expect(data).toEqual([]);
    const { data: still } = await coachA.client.from("exercise_alternatives").select("id").eq("exercise_id", exA1);
    expect(still).toHaveLength(1);
  });
});

describe("exercise_alternatives: per-program-item override", () => {
  it("a coach sets an override on their client's item; the client reads it, a foreign coach does not", async () => {
    const { error } = await coachA.client.from("exercise_alternatives").insert({
      exercise_id: exA1,
      alternative_exercise_id: exA3,
      coach_id: coachA.userId,
      program_item_id: itemId,
    });
    expect(error).toBeNull();

    const asClient = await clientOfA.client.from("exercise_alternatives").select("id").eq("program_item_id", itemId);
    const foreign = await coachB.client.from("exercise_alternatives").select("id").eq("program_item_id", itemId);
    expect(asClient.data).toHaveLength(1);
    expect(foreign.data).toEqual([]);
  });

  it("rejects an override whose exercise_id does not match the item's exercise", async () => {
    const { error } = await coachA.client.from("exercise_alternatives").insert({
      exercise_id: exA2,
      alternative_exercise_id: exA3,
      coach_id: coachA.userId,
      program_item_id: itemId,
    });
    expect(error).not.toBeNull();
  });

  it("a foreign coach cannot attach an override to someone else's item", async () => {
    const { error } = await coachB.client.from("exercise_alternatives").insert({
      exercise_id: exA1,
      alternative_exercise_id: exA2,
      coach_id: coachB.userId,
      program_item_id: itemId,
    });
    expect(error).not.toBeNull();
  });
});
