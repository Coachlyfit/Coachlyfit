import { describe, expect, it } from "vitest";
import { WorkoutsService, groupSwapsBySession } from "./workouts.service";

function fakeSupabase(opts: {
  parent?: unknown;
  rows?: unknown[];
  affected?: unknown[];
  prescribed?: unknown;
} = {}) {
  const { parent = null, rows = [], affected = [{ id: "1" }], prescribed = null } = opts;

  const inserts: { table: string; payload: unknown }[] = [];
  const upserts: { table: string; payload: unknown; onConflict?: string }[] = [];
  const updates: { table: string; payload: unknown }[] = [];
  const deletes: { table: string }[] = [];
  const affectedRows = async () => ({ data: affected, error: null });

  const db = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: table === "program_item_sets" ? prescribed : parent,
                error: null,
              }),
            }),
            maybeSingle: async () => ({ data: parent, error: null }),
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: parent, error: null }),
              }),
            }),
            select: () => ({ id: "1" }),
          }),
          order: () => ({ limit: async () => ({ data: rows, error: null }) }),
        }),
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          return {
            select: () => ({
              single: async () => ({ data: { id: "new-1", ...(payload as object) }, error: null }),
            }),
          };
        },
        upsert: (payload: unknown, opts?: { onConflict?: string }) => {
          upserts.push({ table, payload, onConflict: opts?.onConflict });
          return {
            select: () => ({
              single: async () => ({ data: { id: "new-1", ...(payload as object) }, error: null }),
            }),
          };
        },
        update: (payload: unknown) => {
          updates.push({ table, payload });
          return {
            eq: () => ({
              select: (columns?: string) => {
                const promise = Promise.resolve({
                  data: columns === "id" ? affected : { id: "1", ...(payload as object) },
                  error: null,
                });
                return Object.assign(promise, {
                  maybeSingle: async () => ({ data: { id: "1", ...(payload as object) }, error: null }),
                });
              },
            }),
          };
        },
        delete: () => {
          deletes.push({ table });
          return { eq: () => ({ select: affectedRows }) };
        },
      };
    },
  };

  return { db: db as never, inserts, upserts, updates, deletes };
}

describe("WorkoutsService", () => {
  it("startSession derives coach_id/client_id from the parent program_day, not a caller argument", async () => {
    const { db, inserts } = fakeSupabase({ parent: { coach_id: "coach-1", client_id: "client-1" } });
    await new WorkoutsService(db).startSession("day-1");

    expect(inserts[0].table).toBe("workout_sessions");
    expect(inserts[0].payload).toEqual({
      coach_id: "coach-1",
      client_id: "client-1",
      program_day_id: "day-1",
    });
  });

  it("startSession returns null without inserting when the program_day isn't visible", async () => {
    const { db, inserts } = fakeSupabase({ parent: null });
    const result = await new WorkoutsService(db).startSession("day-1");

    expect(result).toBeNull();
    expect(inserts).toHaveLength(0);
  });

  it("startSession returns null without inserting for a template day (client_id null)", async () => {
    const { db, inserts } = fakeSupabase({ parent: { coach_id: "coach-1", client_id: null } });
    const result = await new WorkoutsService(db).startSession("day-1");

    expect(result).toBeNull();
    expect(inserts).toHaveLength(0);
  });

  it("logSet derives coach_id/client_id from the parent session and upserts on the (session,item,set) key", async () => {
    const { db, upserts } = fakeSupabase({
      parent: { coach_id: "coach-1", client_id: "client-1" },
      prescribed: { reps: 10, weight: 65 },
    });
    await new WorkoutsService(db).logSet("session-1", { program_item_id: "item-1", set_index: 0, weight: 60, reps: 8 });

    expect(upserts[0].table).toBe("workout_set_logs");
    expect(upserts[0].onConflict).toBe("session_id,program_item_id,set_index");
    expect(upserts[0].payload).toEqual({
      coach_id: "coach-1",
      client_id: "client-1",
      session_id: "session-1",
      program_item_id: "item-1",
      set_index: 0,
      weight: 60,
      reps: 8,
      prescribed_reps: 10,
      prescribed_weight: 65,
    });
  });

  it("logSet writes null prescribed_reps/prescribed_weight when no matching program_item_sets row exists", async () => {
    const { db, upserts } = fakeSupabase({ parent: { coach_id: "coach-1", client_id: "client-1" }, prescribed: null });
    await new WorkoutsService(db).logSet("session-1", { program_item_id: "item-1", set_index: 0 });

    expect(upserts[0].payload).toMatchObject({ prescribed_reps: null, prescribed_weight: null });
  });

  it("logSet returns null without upserting when the session isn't visible", async () => {
    const { db, upserts } = fakeSupabase({ parent: null });
    const result = await new WorkoutsService(db).logSet("session-1", { program_item_id: "item-1", set_index: 0 });

    expect(result).toBeNull();
    expect(upserts).toHaveLength(0);
  });

  it("updateSet updates the row by id", async () => {
    const { db, updates } = fakeSupabase();
    const result = await new WorkoutsService(db).updateSet("log-1", { weight: 62.5, reps: 9, rpe: 8 });

    expect(updates[0].table).toBe("workout_set_logs");
    expect(updates[0].payload).toEqual({ weight: 62.5, reps: 9, rpe: 8 });
    expect(result).not.toBeNull();
  });

  it("deleteSet reports false when RLS matches no row", async () => {
    const { db } = fakeSupabase({ affected: [] });
    expect(await new WorkoutsService(db).deleteSet("log-1")).toBe(false);
  });

  it("deleteSet reports true when a row was actually deleted", async () => {
    const { db } = fakeSupabase({ affected: [{ id: "log-1" }] });
    expect(await new WorkoutsService(db).deleteSet("log-1")).toBe(true);
  });

  it("completeSession reports false when RLS matches no row", async () => {
    const { db } = fakeSupabase({ affected: [] });
    expect(await new WorkoutsService(db).completeSession("session-1", 900)).toBe(false);
  });

  it("completeSession reports true when a row was actually affected", async () => {
    const { db } = fakeSupabase({ affected: [{ id: "session-1" }] });
    expect(await new WorkoutsService(db).completeSession("session-1", 900)).toBe(true);
  });

  it("setExerciseResult derives coach_id/client_id from the parent session and upserts on (session,item)", async () => {
    const { db, upserts } = fakeSupabase({ parent: { coach_id: "coach-1", client_id: "client-1" } });
    await new WorkoutsService(db).setExerciseResult("session-1", "item-1", { status: "done" });

    expect(upserts[0].table).toBe("workout_exercise_results");
    expect(upserts[0].onConflict).toBe("session_id,program_item_id");
    expect(upserts[0].payload).toEqual({
      coach_id: "coach-1",
      client_id: "client-1",
      session_id: "session-1",
      program_item_id: "item-1",
      status: "done",
    });
  });

  it("setExerciseResult returns null without upserting when the session isn't visible", async () => {
    const { db, upserts } = fakeSupabase({ parent: null });
    const result = await new WorkoutsService(db).setExerciseResult("session-1", "item-1", { status: "skipped" });

    expect(result).toBeNull();
    expect(upserts).toHaveLength(0);
  });
});

describe("groupSwapsBySession", () => {
  it("groups by session and dedupes by program_item_id", () => {
    const rows = [
      {
        session_id: "s1",
        program_item_id: "item-1",
        program_items: { exercises: { name_ar: "بنش بار", name_en: "Barbell Bench Press" } },
        exercises: { name_ar: "بنش دمبل", name_en: "Dumbbell Bench Press" },
      },
      {
        // second logged set of the SAME swapped exercise in the same session — must not duplicate
        session_id: "s1",
        program_item_id: "item-1",
        program_items: { exercises: { name_ar: "بنش بار", name_en: "Barbell Bench Press" } },
        exercises: { name_ar: "بنش دمبل", name_en: "Dumbbell Bench Press" },
      },
      {
        session_id: "s2",
        program_item_id: "item-2",
        program_items: { exercises: { name_ar: "سكوات", name_en: "Squat" } },
        exercises: { name_ar: "لانج", name_en: "Lunge" },
      },
    ];

    const grouped = groupSwapsBySession(rows);

    expect(grouped.get("s1")).toEqual([
      { original: { ar: "بنش بار", en: "Barbell Bench Press" }, substitute: { ar: "بنش دمبل", en: "Dumbbell Bench Press" } },
    ]);
    expect(grouped.get("s2")).toEqual([
      { original: { ar: "سكوات", en: "Squat" }, substitute: { ar: "لانج", en: "Lunge" } },
    ]);
  });

  it("skips a row missing either exercise name (join came back null)", () => {
    const rows = [
      { session_id: "s1", program_item_id: "item-1", program_items: null, exercises: { name_ar: "أ", name_en: "A" } },
    ];
    expect(groupSwapsBySession(rows).get("s1")).toBeUndefined();
  });

  it("returns an empty map for no rows", () => {
    expect(groupSwapsBySession([]).size).toBe(0);
  });
});
