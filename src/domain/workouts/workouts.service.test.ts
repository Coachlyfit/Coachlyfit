import { describe, expect, it } from "vitest";
import { WorkoutsService } from "./workouts.service";

function fakeSupabase(opts: {
  parent?: unknown;
  rows?: unknown[];
  affected?: unknown[];
} = {}) {
  const { parent = null, rows = [], affected = [{ id: "1" }] } = opts;

  const inserts: { table: string; payload: unknown }[] = [];
  const updates: { table: string; payload: unknown }[] = [];
  const affectedRows = async () => ({ data: affected, error: null });

  const db = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: parent, error: null }),
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: parent, error: null }),
              }),
            }),
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
        update: (payload: unknown) => {
          updates.push({ table, payload });
          return { eq: () => ({ select: affectedRows }) };
        },
      };
    },
  };

  return { db: db as never, inserts, updates };
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

  it("logSet derives coach_id/client_id from the parent session", async () => {
    const { db, inserts } = fakeSupabase({ parent: { coach_id: "coach-1", client_id: "client-1" } });
    await new WorkoutsService(db).logSet("session-1", { program_item_id: "item-1", set_index: 0, weight: 60, reps: 8 });

    expect(inserts[0].table).toBe("workout_set_logs");
    expect(inserts[0].payload).toEqual({
      coach_id: "coach-1",
      client_id: "client-1",
      session_id: "session-1",
      program_item_id: "item-1",
      set_index: 0,
      weight: 60,
      reps: 8,
    });
  });

  it("completeSession reports false when RLS matches no row", async () => {
    const { db } = fakeSupabase({ affected: [] });
    expect(await new WorkoutsService(db).completeSession("session-1", 900)).toBe(false);
  });

  it("completeSession reports true when a row was actually affected", async () => {
    const { db } = fakeSupabase({ affected: [{ id: "session-1" }] });
    expect(await new WorkoutsService(db).completeSession("session-1", 900)).toBe(true);
  });
});
