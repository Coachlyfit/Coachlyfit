// The source split (global vs coach-private) is enforced in Postgres, not in
// the UI or the service — the filter buttons only narrow what RLS already
// permits. These tests are the actual guarantee behind "a coach never sees
// another coach's exercises" and "an admin can curate global rows without
// getting write access to every coach's private ones".
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { LibraryService } from "@/domain/library/library.service";
import { rlsAdmin as service, createRlsUser } from "./rls-test-helpers";

async function createCoach(tag: string) {
  return createRlsUser(`source-coach-${tag}`, {
    role: "coach",
    full_name: `Coach ${tag}`,
    business_name: `${tag} Gym`,
    locale: "en",
  });
}

async function createAdmin() {
  const { userId, client } = await createRlsUser("source-admin", {
    role: "admin",
    full_name: "Platform Admin",
    locale: "en",
  });
  // The signup trigger only mints coach/client rows, so force the role.
  const update = await service.from("profiles").update({ role: "admin" }).eq("id", userId);
  if (update.error) throw update.error;
  return { userId, client };
}

let coachA: { userId: string; client: SupabaseClient<Database> };
let coachB: { userId: string; client: SupabaseClient<Database> };
let admin: { userId: string; client: SupabaseClient<Database> };
let exerciseA: { id: string };

beforeAll(async () => {
  [coachA, coachB, admin] = await Promise.all([createCoach("a"), createCoach("b"), createAdmin()]);
  exerciseA = await new LibraryService(coachA.client).createExercise(coachA.userId, {
    name_ar: "ضغط بذراع واحدة",
    name_en: "Single Arm Cable Press",
    muscle_group: "chest",
  });
}, 60_000);

describe("library source isolation", () => {
  it("a new coach exercise is private — coach B never sees it under any source", async () => {
    const libraryB = new LibraryService(coachB.client);
    for (const source of ["all", "global", "mine"] as const) {
      const { rows } = await libraryB.searchExercises({ source });
      expect(rows.map((r) => r.id)).not.toContain(exerciseA.id);
    }
  });

  it("'mine' returns only the caller's own rows, with no coach id passed in", async () => {
    const { rows } = await new LibraryService(coachA.client).searchExercises({ source: "mine" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.coach_id === coachA.userId)).toBe(true);
    expect(rows.map((r) => r.id)).toContain(exerciseA.id);
  });

  it("'global' returns only platform rows, and both coaches see the same ones", async () => {
    const [globalAPage, globalBPage] = await Promise.all([
      new LibraryService(coachA.client).searchExercises({ source: "global" }),
      new LibraryService(coachB.client).searchExercises({ source: "global" }),
    ]);
    const globalA = globalAPage.rows;
    const globalB = globalBPage.rows;
    expect(globalA.every((r) => r.coach_id === null)).toBe(true);
    expect(globalA.map((r) => r.id).sort()).toEqual(globalB.map((r) => r.id).sort());
  });

  it("search composes with the source filter", async () => {
    const { rows: mine } = await new LibraryService(coachA.client).searchExercises({
      query: "press",
      source: "mine",
    });
    expect(mine.map((r) => r.id)).toContain(exerciseA.id);

    const { rows: global } = await new LibraryService(coachA.client).searchExercises({
      query: "press",
      source: "global",
    });
    expect(global.map((r) => r.id)).not.toContain(exerciseA.id);
    expect(global.every((r) => r.coach_id === null)).toBe(true);
  });

  it("a coach cannot edit or delete a global exercise", async () => {
    const globalRow = await service
      .from("exercises")
      .select("id, name_en")
      .is("coach_id", null)
      .limit(1)
      .single();
    if (!globalRow.data) throw new Error("no seeded global exercise to test against");

    const library = new LibraryService(coachA.client);
    // Both report false rather than throwing: RLS drops the row from the
    // statement, which Postgres reports as a successful 0-row write. That is
    // exactly why the service returns a boolean.
    expect(await library.updateExercise(globalRow.data.id, {
      name_ar: "hacked",
      name_en: "hacked",
    })).toBe(false);
    expect(await library.deleteExercise(globalRow.data.id)).toBe(false);

    const after = await service
      .from("exercises")
      .select("name_en")
      .eq("id", globalRow.data.id)
      .single();
    expect(after.data?.name_en).toBe(globalRow.data.name_en);
  });
});

describe("admin library permissions", () => {
  it("admin sees every coach's rows (needed to find promotion candidates)", async () => {
    const { rows } = await new LibraryService(admin.client).searchExercises({ source: "all" });
    expect(rows.map((r) => r.id)).toContain(exerciseA.id);
  });

  it("admin can create and edit a global exercise", async () => {
    const library = new LibraryService(admin.client);
    const created = await library.createGlobalExercise({
      name_ar: "تمرين عام",
      name_en: "Admin Global Exercise",
      muscle_group: "back",
    });
    expect(created.coach_id).toBeNull();

    expect(
      await library.updateExercise(created.id, {
        name_ar: "تمرين عام",
        name_en: "Admin Global Exercise Renamed",
      })
    ).toBe(true);

    expect(await library.deleteExercise(created.id)).toBe(true);
  });

  it("admin CANNOT write a coach's private exercise — only promote it", async () => {
    // This is the tightening in 20260801000015: the previous
    // admin_write_global was `for all using (is_admin())` with no coach_id
    // qualifier, so this update used to succeed.
    const updated = await new LibraryService(admin.client).updateExercise(exerciseA.id, {
      name_ar: "مسروق",
      name_en: "Admin Overwrote This",
    });
    expect(updated).toBe(false);

    const after = await service
      .from("exercises")
      .select("name_en, coach_id")
      .eq("id", exerciseA.id)
      .single();
    expect(after.data?.name_en).toBe("Single Arm Cable Press");
    expect(after.data?.coach_id).toBe(coachA.userId);
  });

  it("a coach cannot promote anything", async () => {
    await expect(new LibraryService(coachA.client).promoteExercise(exerciseA.id)).rejects.toThrow();
  });
});

describe("promotion", () => {
  let promoted: { id: string };

  beforeAll(async () => {
    promoted = await new LibraryService(coachA.client).createExercise(coachA.userId, {
      name_ar: "تمرين للترقية",
      name_en: "Promote Me",
      muscle_group: "arms",
    });
  }, 30_000);

  it("reassigns in place, keeping the id so plan references survive", async () => {
    await new LibraryService(admin.client).promoteExercise(promoted.id);

    const row = await service
      .from("exercises")
      .select("id, coach_id")
      .eq("id", promoted.id)
      .single();
    expect(row.data?.id).toBe(promoted.id);
    expect(row.data?.coach_id).toBeNull();
  });

  it("makes it visible to a different coach", async () => {
    const { rows } = await new LibraryService(coachB.client).searchExercises({ source: "global" });
    expect(rows.map((r) => r.id)).toContain(promoted.id);
  });

  it("takes it out of the author's own writable set", async () => {
    const library = new LibraryService(coachA.client);
    expect(await library.updateExerciseGroup(promoted.id, "legs")).toBe(false);
    expect(await library.deleteExercise(promoted.id)).toBe(false);
  });

  it("notifies the former owner, and only them", async () => {
    const { data } = await coachA.client
      .from("notifications")
      .select("kind, payload")
      .eq("kind", "exercise_promoted");
    expect(data?.length).toBeGreaterThan(0);
    expect(
      data?.some((n) => (n.payload as { exercise_id?: string }).exercise_id === promoted.id)
    ).toBe(true);

    // read_own means coach B's client sees none of coach A's notifications.
    const other = await coachB.client.from("notifications").select("id");
    expect(other.data).toEqual([]);
  });

  it("rejects a second promotion instead of double-notifying", async () => {
    await expect(new LibraryService(admin.client).promoteExercise(promoted.id)).rejects.toThrow();
  });
});
