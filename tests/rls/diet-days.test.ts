// Diet plan days (20261124000001_diet_plan_days.sql): a plan's day-types and
// weekly schedule follow the same RLS as its meals. A client reads only their
// own plan's days; another client of the SAME coach, and any other coach,
// read none; a client never writes. A meal / schedule row can only point at a
// day of its own plan, and the migration's backfill left every meal on a day
// of its own plan.
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { createRlsUser, rlsAdmin } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

let coachA: User;
let coachB: User;
let clientA1: User;
let clientA1Id: string;
let clientA2: User;
let planId: string;
let trainingDayId: string;
let restDayId: string;
let templateId: string;
let templateDayId: string;

async function createCoach(tag: string) {
  return createRlsUser(`diet-days-coach-${tag}`, {
    role: "coach",
    full_name: `Coach ${tag}`,
    business_name: `${tag} Gym`,
    locale: "en",
  });
}

// Same shape as recipes.test.ts's inviteClient.
async function inviteClient(coach: User, tag: string) {
  const { data: row, error } = await coach.client
    .from("clients")
    .insert({ coach_id: coach.userId, display_name: `Client ${tag}` })
    .select("id")
    .single();
  if (error) throw error;
  const tokenHash = createHash("sha256").update(randomBytes(24).toString("base64url")).digest("hex");
  const invite = await coach.client.from("invites").insert({ coach_id: coach.userId, client_id: row.id, token_hash: tokenHash });
  if (invite.error) throw invite.error;
  const user = await createRlsUser(`diet-days-client-${tag}`, {
    role: "client",
    full_name: `Client ${tag}`,
    locale: "en",
    invite_token_hash: tokenHash,
  });
  return { id: row.id, user };
}

async function createPlan(coach: User, clientId: string | null) {
  const { data, error } = await coach.client
    .from("diet_plans")
    .insert({ coach_id: coach.userId, client_id: clientId, name_ar: "خطة", name_en: "Plan" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function createDay(coach: User, plan: string, clientId: string | null, kind: string, order: number) {
  const { data, error } = await coach.client
    .from("diet_plan_days")
    .insert({
      coach_id: coach.userId,
      client_id: clientId,
      diet_plan_id: plan,
      name_ar: kind,
      name_en: kind,
      kind,
      order_index: order,
      target_kcal: 2000 + order * 100,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  [coachA, coachB] = await Promise.all([createCoach("a"), createCoach("b")]);
  const [one, two] = await Promise.all([inviteClient(coachA, "one"), inviteClient(coachA, "two")]);
  clientA1Id = one.id;
  clientA1 = one.user;
  clientA2 = two.user;

  planId = await createPlan(coachA, clientA1Id);
  trainingDayId = await createDay(coachA, planId, clientA1Id, "training", 0);
  restDayId = await createDay(coachA, planId, clientA1Id, "rest", 1);
  const schedule = await coachA.client.from("diet_plan_schedule").insert([
    { diet_plan_id: planId, weekday: 1, diet_plan_day_id: trainingDayId, coach_id: coachA.userId, client_id: clientA1Id },
    { diet_plan_id: planId, weekday: 5, diet_plan_day_id: restDayId, coach_id: coachA.userId, client_id: clientA1Id },
  ]);
  if (schedule.error) throw schedule.error;

  // A template (client_id null) with a day of its own.
  templateId = await createPlan(coachA, null);
  templateDayId = await createDay(coachA, templateId, null, "custom", 0);
}, 120_000);

describe("diet_plan_days / diet_plan_schedule RLS", () => {
  it("a client reads their own plan's days and weekly schedule", async () => {
    const days = await clientA1.client.from("diet_plan_days").select("id").eq("diet_plan_id", planId);
    expect(days.error).toBeNull();
    expect(days.data?.map((d) => d.id).sort()).toEqual([trainingDayId, restDayId].sort());

    const schedule = await clientA1.client.from("diet_plan_schedule").select("weekday").eq("diet_plan_id", planId);
    expect(schedule.error).toBeNull();
    expect(schedule.data?.map((s) => s.weekday).sort()).toEqual([1, 5]);
  });

  it("another client of the same coach reads none of them", async () => {
    const days = await clientA2.client.from("diet_plan_days").select("id").eq("diet_plan_id", planId);
    expect(days.error).toBeNull();
    expect(days.data).toEqual([]);

    const schedule = await clientA2.client.from("diet_plan_schedule").select("weekday").eq("diet_plan_id", planId);
    expect(schedule.error).toBeNull();
    expect(schedule.data).toEqual([]);
  });

  it("another coach reads none of them", async () => {
    const days = await coachB.client.from("diet_plan_days").select("id").eq("diet_plan_id", planId);
    expect(days.error).toBeNull();
    expect(days.data).toEqual([]);

    const schedule = await coachB.client.from("diet_plan_schedule").select("weekday").eq("diet_plan_id", planId);
    expect(schedule.error).toBeNull();
    expect(schedule.data).toEqual([]);
  });

  it("the owning coach reads and updates their own days", async () => {
    const days = await coachA.client.from("diet_plan_days").select("id").eq("diet_plan_id", planId);
    expect(days.data).toHaveLength(2);

    const updated = await coachA.client
      .from("diet_plan_days")
      .update({ target_kcal: 2500 })
      .eq("id", trainingDayId)
      .select("id");
    expect(updated.error).toBeNull();
    expect(updated.data).toHaveLength(1);
  });

  it("another coach can't add a day to someone else's plan", async () => {
    const attempt = await coachB.client.from("diet_plan_days").insert({
      coach_id: coachB.userId,
      client_id: clientA1Id,
      diet_plan_id: planId,
      name_ar: "x",
      name_en: "x",
      kind: "custom",
    });
    expect(attempt.error).not.toBeNull();
  });

  it("another coach can't change or delete someone else's day", async () => {
    const updated = await coachB.client
      .from("diet_plan_days")
      .update({ name_en: "hijacked" })
      .eq("id", trainingDayId)
      .select("id");
    expect(updated.data ?? []).toEqual([]);

    const deleted = await coachB.client.from("diet_plan_days").delete().eq("id", trainingDayId).select("id");
    expect(deleted.data ?? []).toEqual([]);

    const check = await rlsAdmin.from("diet_plan_days").select("name_en").eq("id", trainingDayId).single();
    expect(check.data?.name_en).toBe("training");
  });

  it("a client can't write days or the schedule", async () => {
    const insert = await clientA1.client.from("diet_plan_days").insert({
      coach_id: coachA.userId,
      client_id: clientA1Id,
      diet_plan_id: planId,
      name_ar: "x",
      name_en: "x",
      kind: "custom",
    });
    expect(insert.error).not.toBeNull();

    const update = await clientA1.client
      .from("diet_plan_days")
      .update({ target_kcal: 9999 })
      .eq("id", trainingDayId)
      .select("id");
    expect(update.data ?? []).toEqual([]);

    const remove = await clientA1.client.from("diet_plan_schedule").delete().eq("diet_plan_id", planId).select("weekday");
    expect(remove.data ?? []).toEqual([]);
  });

  it("a template's days are invisible to clients", async () => {
    const days = await clientA1.client.from("diet_plan_days").select("id").eq("id", templateDayId);
    expect(days.error).toBeNull();
    expect(days.data).toEqual([]);
  });
});

describe("a day can only hold things of its own plan", () => {
  it("a schedule row can't point at another plan's day", async () => {
    const attempt = await coachA.client.from("diet_plan_schedule").insert({
      diet_plan_id: planId,
      weekday: 3,
      diet_plan_day_id: templateDayId,
      coach_id: coachA.userId,
      client_id: clientA1Id,
    });
    expect(attempt.error).not.toBeNull();
  });

  it("a meal can't be put on another plan's day", async () => {
    const attempt = await rlsAdmin.from("meals").insert({
      coach_id: coachA.userId,
      client_id: clientA1Id,
      diet_plan_id: planId,
      diet_plan_day_id: templateDayId,
    });
    expect(attempt.error).not.toBeNull();
  });

  it("deleting a day deletes its meals and clears its weekday", async () => {
    const meal = await coachA.client
      .from("meals")
      .insert({ coach_id: coachA.userId, client_id: clientA1Id, diet_plan_id: planId, diet_plan_day_id: restDayId })
      .select("id")
      .single();
    expect(meal.error).toBeNull();

    const removed = await coachA.client.from("diet_plan_days").delete().eq("id", restDayId).select("id");
    expect(removed.data).toHaveLength(1);

    const meals = await rlsAdmin.from("meals").select("id").eq("id", meal.data!.id);
    expect(meals.data).toEqual([]);
    const schedule = await rlsAdmin.from("diet_plan_schedule").select("weekday").eq("diet_plan_id", planId);
    expect(schedule.data?.map((s) => s.weekday)).toEqual([1]);
  });
});

// The migration's backfill: every meal ended up on a day of its own plan, and
// no plan that has meals is without a day. (Plan-level targets staying equal to
// the default day's is checked once, at migration time, against the counts
// taken before it ran — later edits are allowed to diverge them.)
describe("backfill invariants", () => {
  it("every meal sits on a day of its own plan", async () => {
    const [meals, days] = await Promise.all([
      rlsAdmin.from("meals").select("id, diet_plan_id, diet_plan_day_id"),
      rlsAdmin.from("diet_plan_days").select("id, diet_plan_id"),
    ]);
    expect(meals.error).toBeNull();
    expect(days.error).toBeNull();

    const planOfDay = new Map(days.data!.map((d) => [d.id, d.diet_plan_id]));
    const misplaced = meals.data!.filter((m) => planOfDay.get(m.diet_plan_day_id) !== m.diet_plan_id);
    expect(misplaced).toEqual([]);
  });

  it("every plan that has meals has at least one day", async () => {
    const { data, error } = await rlsAdmin.from("diet_plans").select("id, meals(id), diet_plan_days(id)");
    expect(error).toBeNull();
    const dayless = data!.filter((p) => p.meals.length > 0 && p.diet_plan_days.length === 0);
    expect(dayless).toEqual([]);
  });
});
