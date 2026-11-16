import { describe, expect, it } from "vitest";
import { GoogleApiError } from "@/lib/google/errors";
import { BUSY_WINDOW_DAYS, GoogleBusyService } from "./busy.service";

const NOW = new Date("2026-01-18T10:00:00Z");

function fakeDb(connections: { coach_id: string }[]) {
  const rpcs: { fn: string; args: unknown }[] = [];
  const writes: { table: string; op: string; payload?: unknown }[] = [];
  const chain = (result: unknown) => {
    const c: unknown = new Proxy({}, { get: (_t, prop) => (prop === "then" ? (resolve: (v: unknown) => void) => resolve(result) : () => c) });
    return c;
  };
  const db = {
    from: (table: string) => ({
      select: () => chain({ data: connections, error: null }),
      update: (payload: unknown) => {
        writes.push({ table, op: "update", payload });
        return chain({ data: [], error: null });
      },
    }),
    rpc: async (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      return { error: null };
    },
  };
  return { db: db as never, rpcs, writes };
}

describe("GoogleBusyService.refreshAll", () => {
  it("stores each coach's busy intervals (start/end only) for the next 60 days", async () => {
    const fake = fakeDb([{ coach_id: "c1" }, { coach_id: "c2" }]);
    const asked: { timeMin: string; timeMax: string }[] = [];
    const service = new GoogleBusyService(fake.db, async () => ({ accessToken: "at", calendarId: "cal" }), () => NOW, async (_t, range) => {
      asked.push(range);
      return [{ start: "2026-01-20T08:00:00Z", end: "2026-01-20T09:00:00Z" }];
    });

    expect(await service.refreshAll()).toEqual({ refreshed: 2, failed: 0 });
    expect(asked[0]).toEqual({
      timeMin: NOW.toISOString(),
      timeMax: new Date(NOW.getTime() + BUSY_WINDOW_DAYS * 24 * 3_600_000).toISOString(),
    });
    expect(fake.rpcs).toEqual([
      { fn: "replace_google_busy", args: { p_coach_id: "c1", p_blocks: [{ starts_at: "2026-01-20T08:00:00Z", ends_at: "2026-01-20T09:00:00Z" }] } },
      { fn: "replace_google_busy", args: { p_coach_id: "c2", p_blocks: [{ starts_at: "2026-01-20T08:00:00Z", ends_at: "2026-01-20T09:00:00Z" }] } },
    ]);
  });

  it("keeps the previous blocks when Google fails for one coach, and carries on with the rest", async () => {
    const fake = fakeDb([{ coach_id: "c1" }, { coach_id: "c2" }]);
    const service = new GoogleBusyService(fake.db, async (coachId) => {
      if (coachId === "c1") throw new GoogleApiError(503, "backendError");
      return { accessToken: "at", calendarId: "cal" };
    }, () => NOW, async () => []);

    expect(await service.refreshAll()).toEqual({ refreshed: 1, failed: 1 });
    // Only c2 was replaced; c1's old blocks are untouched.
    expect(fake.rpcs.map((r) => (r.args as { p_coach_id: string }).p_coach_id)).toEqual(["c2"]);
  });

  it("flags a dead grant for reconnection", async () => {
    const fake = fakeDb([{ coach_id: "c1" }]);
    const service = new GoogleBusyService(fake.db, async () => {
      throw new GoogleApiError(400, "invalid_grant");
    }, () => NOW);
    await service.refreshAll();
    expect(fake.writes).toContainEqual({ table: "google_connections", op: "update", payload: { status: "needs_reconnect" } });
  });
});
