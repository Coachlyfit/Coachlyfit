import { describe, expect, it } from "vitest";
import { WorkoutsService } from "./workouts.service";

/** Minimal chain for startOrGetActive: program_days lookup, the active-session
 * query, and the workout_sessions insert. Records inserts so a test can assert
 * how many sessions a call created. */
function fakeSupabase(opts: { day: unknown; active: unknown }) {
  const inserts: { table: string; payload: Record<string, unknown> }[] = [];
  const chain = (data: unknown): Record<string, unknown> => {
    const c: Record<string, unknown> = { maybeSingle: async () => ({ data, error: null }) };
    for (const m of ["eq", "is", "gte", "order", "limit"]) c[m] = () => c;
    return c;
  };
  const db = {
    from(table: string) {
      return {
        select: () => chain(table === "program_days" ? opts.day : opts.active),
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { select: () => ({ single: async () => ({ data: { id: "new-1", ...payload }, error: null }) }) };
        },
      };
    },
  };
  return { db: db as never, inserts };
}

describe("WorkoutsService.startOrGetActive", () => {
  const day = { client_id: "client-1", coach_id: "coach-1" };

  it("Start workout creates exactly one session, for any day, with no date fields (started_at is the DB's now())", async () => {
    const { db, inserts } = fakeSupabase({ day, active: null });
    await new WorkoutsService(db).startOrGetActive("push-day");

    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("workout_sessions");
    expect(inserts[0].payload).toEqual({ coach_id: "coach-1", client_id: "client-1", program_day_id: "push-day" });
  });

  it("returns the session already in progress instead of starting a second one", async () => {
    const active = { id: "running", program_day_id: "pull-day", completed_at: null };
    const { db, inserts } = fakeSupabase({ day, active });
    const result = await new WorkoutsService(db).startOrGetActive("push-day");

    expect(result).toBe(active);
    expect(inserts).toHaveLength(0);
  });

  it("returns null without inserting for a day the caller can't see or a template day", async () => {
    for (const hidden of [null, { client_id: null }]) {
      const { db, inserts } = fakeSupabase({ day: hidden, active: null });
      expect(await new WorkoutsService(db).startOrGetActive("x")).toBeNull();
      expect(inserts).toHaveLength(0);
    }
  });
});

describe("opening a card", () => {
  it("never calls the service: the preview route only reads (guard against re-adding auto-start)", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("src/app/[locale]/(client)/c/workout/[sessionId]/page.tsx", "utf8");
    expect(page).not.toMatch(/startSession|startOrGetActive|startSessionAction|startOrResume/);
  });
});
