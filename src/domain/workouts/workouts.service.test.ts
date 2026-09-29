import { describe, expect, it } from "vitest";
import { WorkoutsService, groupSwapsBySession } from "./workouts.service";

function fakeSupabase(opts: {
  parent?: unknown;
  rows?: unknown[];
  affected?: unknown[];
  prescribed?: unknown;
  setLogsForSummary?: unknown[];
  itemsForSummary?: unknown[];
} = {}) {
  const {
    parent = null,
    rows = [],
    affected = [{ id: "1" }],
    prescribed = null,
    setLogsForSummary = [],
    itemsForSummary = [],
  } = opts;

  const inserts: { table: string; payload: unknown }[] = [];
  const upserts: { table: string; payload: unknown; onConflict?: string }[] = [];
  const updates: { table: string; payload: unknown }[] = [];
  const deletes: { table: string }[] = [];
  const affectedRows = async () => ({ data: affected, error: null });

  const db = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => {
            const eqChain = {
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
            };
            // completeSession's summary queries: select(...).eq(...) with
            // no further chaining, resolved directly as a thenable —
            // matches workout_set_logs and program_items in that method.
            const promise = Promise.resolve({
              data: table === "workout_set_logs" ? setLogsForSummary : itemsForSummary,
              error: null,
            });
            return Object.assign(promise, eqChain);
          },
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
            eq: () => {
              // saveSessionProgress awaits .update().eq() directly, no
              // .select() — everything else here chains .select() first.
              const bare = Promise.resolve({ data: null, error: null });
              return Object.assign(bare, {
                select: (columns?: string) => {
                  const promise = Promise.resolve({
                    data: columns === "id" ? affected : { id: "1", ...(payload as object) },
                    error: null,
                  });
                  return Object.assign(promise, {
                    maybeSingle: async () => ({ data: { id: "1", ...(payload as object) }, error: null }),
                  });
                },
              });
            },
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

  it("completeSession computes and persists total_volume/sets_completed/sets_prescribed from the session's logs and program", async () => {
    const { db, updates } = fakeSupabase({
      parent: { program_day_id: "day-1" },
      affected: [{ id: "session-1" }],
      setLogsForSummary: [
        { weight: 60, reps: 8 },
        { weight: 40, reps: 10 },
      ],
      itemsForSummary: [{ program_item_sets: [{ id: "s1" }, { id: "s2" }] }, { program_item_sets: [{ id: "s3" }] }],
    });
    await new WorkoutsService(db).completeSession("session-1", 900);

    const sessionUpdate = updates.find((u) => u.table === "workout_sessions");
    expect(sessionUpdate?.payload).toMatchObject({
      total_volume: 880,
      sets_completed: 2,
      sets_prescribed: 3,
    });
  });

  it("saveSessionProgress updates elapsed_seconds and current_item_id by session id", async () => {
    const { db, updates } = fakeSupabase();
    await new WorkoutsService(db).saveSessionProgress("session-1", 120, "item-1");

    const progressUpdate = updates.find((u) => u.table === "workout_sessions");
    expect(progressUpdate?.payload).toEqual({ elapsed_seconds: 120, current_item_id: "item-1" });
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

  it("getSessionForDay ignores a completed session from a previous week", async () => {
    // Bug regression: program_day_id repeats every cycle/week, so a naive
    // "latest session for this day" lookup resurfaces last week's completed
    // session as still "done" and blocks logging a new one this week.
    const rows = [{ id: "session-old", program_day_id: "day-1", started_at: "2026-09-06T10:00:00.000Z", completed_at: "2026-09-06T10:30:00.000Z" }];
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => ({
              lt: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: rows.find((r) => r.started_at >= "2026-09-13T00:00:00.000Z" && r.started_at < "2026-09-20T00:00:00.000Z") ?? null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };
    const result = await new WorkoutsService(db as never).getSessionForDay("day-1", "2026-09-13");
    expect(result).toBeNull();
  });

  it("getSessionForDay returns a session started within the given week", async () => {
    const rows = [{ id: "session-new", program_day_id: "day-1", started_at: "2026-09-14T10:00:00.000Z", completed_at: null }];
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => ({
              lt: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: rows.find((r) => r.started_at >= "2026-09-13T00:00:00.000Z" && r.started_at < "2026-09-20T00:00:00.000Z") ?? null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };
    const result = await new WorkoutsService(db as never).getSessionForDay("day-1", "2026-09-13");
    expect(result?.id).toBe("session-new");
  });

  it("listPainReports filters to pain > 0, most recent first", async () => {
    const rows = [
      { id: "r1", pain: 3, program_items: { exercises: { name_ar: "أ", name_en: "A" } } },
      { id: "r2", pain: 1, program_items: { exercises: { name_ar: "ب", name_en: "B" } } },
    ];
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gt: () => ({
              order: () => ({
                limit: async () => ({ data: rows, error: null }),
              }),
            }),
          }),
        }),
      }),
    };
    const result = await new WorkoutsService(db as never).listPainReports("client-1");
    expect(result).toEqual(rows);
  });

  it("listSetLogsForClient resolves exercise_id via program_items, overridden by a swap", async () => {
    const rows = [
      { weight: 60, reps: 8, completed_at: "2026-01-01T10:00:00Z", substituted_exercise_id: null, program_items: { exercise_id: "ex-1" } },
      { weight: 40, reps: 10, completed_at: "2026-01-02T10:00:00Z", substituted_exercise_id: "ex-swap", program_items: { exercise_id: "ex-2" } },
      { weight: 20, reps: 12, completed_at: "2026-01-03T10:00:00Z", substituted_exercise_id: null, program_items: null },
    ];
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({ data: rows, error: null }),
            gte: () => ({ order: async () => ({ data: rows, error: null }) }),
          }),
        }),
      }),
    };

    const result = await new WorkoutsService(db as never).listSetLogsForClient("client-1");
    // Row with program_items null is dropped -- a log with no resolvable
    // exercise_id (data integrity edge case) can't feed a per-exercise PR.
    expect(result).toEqual([
      { exercise_id: "ex-1", weight: 60, reps: 8, completed_at: "2026-01-01T10:00:00Z" },
      { exercise_id: "ex-swap", weight: 40, reps: 10, completed_at: "2026-01-02T10:00:00Z" },
    ]);
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

describe("WorkoutsService.getLastPerformance", () => {
  function fakeLogsDb(rows: unknown[]) {
    const calls: string[] = [];
    const chain = {
      in: (col: string) => (calls.push(`in:${col}`), chain),
      neq: (col: string, val: string) => (calls.push(`neq:${col}=${val}`), chain),
      order: () => chain,
      limit: async () => ({ data: rows, error: null }),
    };
    return { db: { from: () => ({ select: () => chain }) } as never, calls };
  }

  const rows = [
    { weight: 70, reps: 8, rpe: 8, program_items: { exercise_id: "ex-1" } },
    { weight: 65, reps: 10, rpe: null, program_items: { exercise_id: "ex-1" } },
  ];

  it("keeps only the latest set per exercise", async () => {
    const { db } = fakeLogsDb(rows);
    const map = await new WorkoutsService(db).getLastPerformance(["ex-1"]);
    expect(map.get("ex-1")).toEqual({ weight: 70, reps: 8, rpe: 8 });
  });

  it("excludes the current session's own sets when asked", async () => {
    const { db, calls } = fakeLogsDb(rows);
    await new WorkoutsService(db).getLastPerformance(["ex-1"], "session-1");
    expect(calls).toContain("neq:session_id=session-1");
  });

  it("doesn't filter by session without an exclude id", async () => {
    const { db, calls } = fakeLogsDb(rows);
    await new WorkoutsService(db).getLastPerformance(["ex-1"]);
    expect(calls.some((c) => c.startsWith("neq:"))).toBe(false);
  });
});
