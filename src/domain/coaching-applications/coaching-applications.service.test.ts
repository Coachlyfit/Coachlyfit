import { describe, expect, it } from "vitest";
import { CoachingApplicationsService } from "./coaching-applications.service";

function fakeSupabase(result: { data?: unknown; error?: unknown } = { data: [] }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
        return (...args: unknown[]) => {
          calls.push([prop, ...args]);
          return chain;
        };
      },
    },
  );
  return { db: { from: (t: string) => (calls.push(["from", t]), chain) } as never, calls };
}

describe("CoachingApplicationsService", () => {
  it("list filters by coach and optional status", async () => {
    const { db, calls } = fakeSupabase();
    await new CoachingApplicationsService(db).list("c1", "new");
    expect(calls).toContainEqual(["eq", "coach_id", "c1"]);
    expect(calls).toContainEqual(["eq", "status", "new"]);
  });

  it("triage updates only status and notes, scoped to coach", async () => {
    const { db, calls } = fakeSupabase({ error: null });
    await new CoachingApplicationsService(db).triage("c1", "a1", { status: "accepted", coachNotes: "" });
    expect(calls).toContainEqual(["update", { status: "accepted", coach_notes: null }]);
    expect(calls).toContainEqual(["eq", "coach_id", "c1"]);
  });

  it("throws on database error", async () => {
    const { db } = fakeSupabase({ error: new Error("x") });
    await expect(new CoachingApplicationsService(db).triage("c1", "a1", { status: "new" })).rejects.toThrow("x");
  });
});
