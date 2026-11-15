// Platform templates are programs with coach_id IS NULL and client_id IS NULL
// (20261118000001_platform_templates.sql). The contract worth proving:
//   - only an admin can write them; coaches can READ published ones but never
//     UPDATE/DELETE/INSERT one, and never see an unpublished one;
//   - a client can't see them at all;
//   - "Customize" copies into the coach's own template, so editing the copy
//     never changes the original or another coach's copy.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";
import { ProgramsService } from "@/domain/programs/programs.service";

async function createCoach(tag: string) {
  return createRlsUser(`pt-coach-${tag}`, { role: "coach", full_name: `Coach ${tag}`, business_name: `${tag} Fitness`, locale: "en" });
}

let adminUser: Awaited<ReturnType<typeof createRlsUser>>;
let coachA: Awaited<ReturnType<typeof createCoach>>;
let coachB: Awaited<ReturnType<typeof createCoach>>;
let clientUser: Awaited<ReturnType<typeof createRlsUser>>;
let clientRowId: string;
let platformId: string;
let dayId: string;
let itemId: string;
let setId: string;
let exerciseId: string;
const slug = `rls-test-${Date.now()}`;

beforeAll(async () => {
  [adminUser, coachA, coachB, clientUser] = await Promise.all([
    createRlsUser("pt-admin", { role: "admin", full_name: "Admin", locale: "en" }),
    createCoach("a"),
    createCoach("b"),
    createRlsUser("pt-client", { role: "client", full_name: "Client", locale: "en" }),
  ]);
  const row = await admin
    .from("clients")
    .insert({ coach_id: coachA.userId, profile_id: clientUser.userId, display_name: "Client A1" })
    .select("id")
    .single();
  if (row.error) throw row.error;
  clientRowId = row.data.id;

  const ex = await admin.from("exercises").select("id").is("coach_id", null).is("archived_at", null).limit(1).single();
  if (ex.error) throw ex.error;
  exerciseId = ex.data.id;

  // the admin authors a template through its own session, so the admin write policy is what's exercised
  const program = await adminUser.client
    .from("programs")
    .insert({ coach_id: null, client_id: null, slug, published: false, name_ar: "قالب اختبار", name_en: "RLS test template", categories: ["strength"] })
    .select("id")
    .single();
  if (program.error) throw program.error;
  platformId = program.data.id;

  const day = await adminUser.client
    .from("program_days")
    .insert({ coach_id: null, client_id: null, program_id: platformId, day_index: 1, label_en: "Day 1", label_ar: "اليوم 1" })
    .select("id")
    .single();
  if (day.error) throw day.error;
  dayId = day.data.id;

  const item = await adminUser.client
    .from("program_items")
    .insert({ coach_id: null, client_id: null, program_day_id: dayId, exercise_id: exerciseId, sets: 1, reps: "10" })
    .select("id")
    .single();
  if (item.error) throw item.error;
  itemId = item.data.id;

  const set = await adminUser.client
    .from("program_item_sets")
    .insert({ coach_id: null, client_id: null, program_item_id: itemId, set_index: 1, reps: 10 })
    .select("id")
    .single();
  if (set.error) throw set.error;
  setId = set.data.id;
}, 90_000);

afterAll(async () => {
  // users are removed by the helper (their copies cascade); the platform row is ownerless, so remove it here
  await admin.from("programs").delete().eq("id", platformId);
});

describe("platform templates: who can read", () => {
  it("an unpublished template is invisible to coaches and clients but visible to an admin", async () => {
    for (const who of [coachA, coachB, clientUser]) {
      const { data } = await who.client.from("programs").select("id").eq("id", platformId);
      expect(data).toEqual([]);
    }
    const { data } = await adminUser.client.from("programs").select("id").eq("id", platformId);
    expect(data).toEqual([{ id: platformId }]);
  });

  it("only an admin can publish", async () => {
    const asCoach = await coachA.client.from("programs").update({ published: true }).eq("id", platformId).select("id");
    expect(asCoach.data ?? []).toEqual([]);

    const asAdmin = await adminUser.client.from("programs").update({ published: true }).eq("id", platformId).select("id");
    expect(asAdmin.error).toBeNull();
    expect(asAdmin.data).toEqual([{ id: platformId }]);
  });

  it("once published, every coach reads the template and its whole tree", async () => {
    for (const who of [coachA, coachB]) {
      const program = await who.client.from("programs").select("id, coach_id, client_id").eq("id", platformId).single();
      expect(program.data).toMatchObject({ id: platformId, coach_id: null, client_id: null });
      expect((await who.client.from("program_days").select("id").eq("id", dayId)).data).toHaveLength(1);
      expect((await who.client.from("program_items").select("id").eq("id", itemId)).data).toHaveLength(1);
      expect((await who.client.from("program_item_sets").select("id").eq("id", setId)).data).toHaveLength(1);
    }
  });

  it("a client never sees a platform template or any part of its tree, even published", async () => {
    expect((await clientUser.client.from("programs").select("id").eq("id", platformId)).data).toEqual([]);
    expect((await clientUser.client.from("program_days").select("id").eq("id", dayId)).data).toEqual([]);
    expect((await clientUser.client.from("program_items").select("id").eq("id", itemId)).data).toEqual([]);
    expect((await clientUser.client.from("program_item_sets").select("id").eq("id", setId)).data).toEqual([]);
  });
});

describe("platform templates: coaches can't change them", () => {
  it("a coach's UPDATE and DELETE match no row on any level of the tree, and nothing changes", async () => {
    const attempts = [
      coachA.client.from("programs").update({ name_en: "hijacked" }).eq("id", platformId).select("id"),
      coachA.client.from("program_days").update({ label_en: "hijacked" }).eq("id", dayId).select("id"),
      coachA.client.from("program_items").update({ reps: "99" }).eq("id", itemId).select("id"),
      coachA.client.from("program_item_sets").update({ reps: 99 }).eq("id", setId).select("id"),
      coachA.client.from("program_item_sets").delete().eq("id", setId).select("id"),
      coachA.client.from("program_items").delete().eq("id", itemId).select("id"),
      coachA.client.from("program_days").delete().eq("id", dayId).select("id"),
      coachA.client.from("programs").delete().eq("id", platformId).select("id"),
    ];
    for (const result of await Promise.all(attempts)) expect(result.data ?? []).toEqual([]);

    const program = await admin.from("programs").select("name_en, published").eq("id", platformId).single();
    expect(program.data).toEqual({ name_en: "RLS test template", published: true });
    expect((await admin.from("program_days").select("label_en").eq("id", dayId).single()).data?.label_en).toBe("Day 1");
    expect((await admin.from("program_items").select("reps").eq("id", itemId).single()).data?.reps).toBe("10");
    expect((await admin.from("program_item_sets").select("reps").eq("id", setId).single()).data?.reps).toBe(10);
  });

  it("a coach can't insert a platform row", async () => {
    const insert = await coachA.client
      .from("programs")
      .insert({ coach_id: null, client_id: null, slug: `${slug}-x`, published: true, name_ar: "x", name_en: "x" });
    expect(insert.error).not.toBeNull();
  });

  it("a platform item can only reference a global exercise", async () => {
    const own = await coachA.client
      .from("exercises")
      .insert({ coach_id: coachA.userId, name_ar: "تمرين خاص", name_en: "Coach A private exercise" })
      .select("id")
      .single();
    expect(own.error).toBeNull();

    const bad = await adminUser.client
      .from("program_items")
      .insert({ coach_id: null, client_id: null, program_day_id: dayId, exercise_id: own.data!.id, sets: 1, reps: "10" });
    expect(bad.error?.code).toBe("23514");
  });
});

describe("customize: copies never touch the original or each other", () => {
  let copyA: string;
  let copyB: string;

  it("customizing copies the tree into the coach's own template and points back at the original", async () => {
    const a = await new ProgramsService(coachA.client).customizePlatformTemplate(platformId, coachA.userId);
    const b = await new ProgramsService(coachB.client).customizePlatformTemplate(platformId, coachB.userId);
    expect(a && b).toBeTruthy();
    copyA = a!.id;
    copyB = b!.id;

    expect(a).toMatchObject({ coach_id: coachA.userId, client_id: null, source_template_id: platformId });
    expect(b).toMatchObject({ coach_id: coachB.userId, client_id: null, source_template_id: platformId });

    const tree = await new ProgramsService(coachA.client).getTree(copyA);
    expect(tree?.program_days).toHaveLength(1);
    expect(tree?.program_days[0].program_items).toHaveLength(1);
    expect(tree?.program_days[0].program_items[0]).toMatchObject({ exercise_id: exerciseId, coach_id: coachA.userId });
    expect(tree?.program_days[0].program_items[0].program_item_sets).toHaveLength(1);
  });

  it("editing a copy changes neither the original nor another coach's copy", async () => {
    const edit = await coachA.client.from("programs").update({ name_en: "A's edited copy" }).eq("id", copyA).select("id");
    expect(edit.data).toEqual([{ id: copyA }]);
    const itemEdit = await coachA.client
      .from("program_items")
      .update({ reps: "5" })
      .eq("program_day_id", (await new ProgramsService(coachA.client).getTree(copyA))!.program_days[0].id)
      .select("id");
    expect(itemEdit.data).toHaveLength(1);

    expect((await admin.from("programs").select("name_en").eq("id", platformId).single()).data?.name_en).toBe("RLS test template");
    expect((await admin.from("program_items").select("reps").eq("id", itemId).single()).data?.reps).toBe("10");
    expect((await admin.from("programs").select("name_en").eq("id", copyB).single()).data?.name_en).toBe("RLS test template");
    const bTree = await new ProgramsService(coachB.client).getTree(copyB);
    expect(bTree?.program_days[0].program_items[0].reps).toBe("10");
  });

  it("a coach can't see another coach's copy, and the coach's own lists show their copy but not the platform original", async () => {
    expect((await coachB.client.from("programs").select("id").eq("id", copyA)).data).toEqual([]);

    const templates = await new ProgramsService(coachA.client).list("templates");
    const ids = templates.map((p) => p.id);
    expect(ids).toContain(copyA);
    expect(ids).not.toContain(platformId);
    expect((await new ProgramsService(coachA.client).listOverview("2000-01-01", "2100-01-01")).map((p) => p.id)).not.toContain(platformId);

    const mine = await new ProgramsService(coachA.client).myPlatformCopies();
    expect(mine.get(platformId)).toBe(copyA);
  });

  it("reset gives the coach a fresh copy of the original and archives the old one", async () => {
    const fresh = await new ProgramsService(coachA.client).resetPlatformCopy(platformId, copyA, coachA.userId);
    expect(fresh).toMatchObject({ coach_id: coachA.userId, source_template_id: platformId });
    expect(fresh!.id).not.toBe(copyA);
    expect((await admin.from("programs").select("archived_at").eq("id", copyA).single()).data?.archived_at).not.toBeNull();
    const tree = await new ProgramsService(coachA.client).getTree(fresh!.id);
    expect(tree?.program_days[0].program_items[0].reps).toBe("10"); // back to the original's value
  });

  it("assigning a platform template to a client clones it onto that client, who can read their copy", async () => {
    const assigned = await new ProgramsService(coachA.client).cloneToClient(platformId, clientRowId);
    expect(assigned).toMatchObject({ coach_id: coachA.userId, client_id: clientRowId, source_template_id: platformId });
    const seen = await clientUser.client.from("programs").select("id").eq("id", assigned!.id);
    expect(seen.data).toEqual([{ id: assigned!.id }]);
    // the original is still ownerless and unchanged
    expect((await admin.from("programs").select("coach_id, client_id").eq("id", platformId).single()).data).toEqual({ coach_id: null, client_id: null });
  });

  it("customizing an unpublished platform template is refused", async () => {
    await adminUser.client.from("programs").update({ published: false }).eq("id", platformId);
    expect(await new ProgramsService(coachB.client).customizePlatformTemplate(platformId, coachB.userId)).toBeNull();
    await adminUser.client.from("programs").update({ published: true }).eq("id", platformId);
  });
});
