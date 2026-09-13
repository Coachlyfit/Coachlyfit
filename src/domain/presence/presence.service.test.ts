import { describe, expect, it } from "vitest";
import { PresenceService, groupByCoach, type OnlineUserRow } from "./presence.service";

// Same fake-DB pattern as invites.service.test.ts: no real Postgres, just
// asserting the rpc name and args the service sends.
function fakeSupabase(rpcResult: { data: unknown; error: unknown }) {
  const calls: { fn: string; args: unknown }[] = [];
  const db = {
    rpc(fn: string, args?: unknown) {
      calls.push({ fn, args });
      return Promise.resolve(rpcResult);
    },
  };
  return { db: db as never, calls };
}

describe("PresenceService", () => {
  it("touch() calls touch_last_seen with no arguments (own row only, nothing to spoof)", async () => {
    const { db, calls } = fakeSupabase({ data: null, error: null });
    await new PresenceService(db).touch();
    expect(calls).toEqual([{ fn: "touch_last_seen", args: undefined }]);
  });

  it("touch() surfaces an rpc error", async () => {
    const { db } = fakeSupabase({ data: null, error: new Error("boom") });
    await expect(new PresenceService(db).touch()).rejects.toThrow("boom");
  });

  it("list() never sends a coach-id argument -- scoping lives entirely in the RPC", async () => {
    const { db, calls } = fakeSupabase({ data: [], error: null });
    await new PresenceService(db).list({ search: "ali", page: 2, pageSize: 10 });

    expect(calls[0].fn).toBe("list_online_users");
    const args = calls[0].args as Record<string, unknown>;
    expect(Object.keys(args).sort()).toEqual(["p_limit", "p_offset", "p_search"]);
    expect(args).toMatchObject({ p_search: "ali", p_limit: 10, p_offset: 10 });
  });

  it("list() maps snake_case rows and reads totals off the first row", async () => {
    const { db } = fakeSupabase({
      data: [
        {
          user_id: "u1",
          name: "Alice",
          avatar_url: null,
          role: "client",
          coach_id: "c1",
          coach_name: "Coach Bob",
          last_seen_at: "2026-09-13T10:00:00Z",
          online: true,
          total_count: 3,
          online_count: 1,
        },
      ],
      error: null,
    });

    const result = await new PresenceService(db).list();
    expect(result.total).toBe(3);
    expect(result.online).toBe(1);
    expect(result.rows[0]).toMatchObject({ userId: "u1", coachId: "c1", online: true });
  });

  it("list() returns zero totals for an empty page rather than throwing", async () => {
    const { db } = fakeSupabase({ data: [], error: null });
    const result = await new PresenceService(db).list();
    expect(result).toEqual({ rows: [], total: 0, online: 0 });
  });
});

function row(overrides: Partial<OnlineUserRow>): OnlineUserRow {
  return {
    userId: "u",
    name: "n",
    avatarUrl: null,
    role: "client",
    coachId: null,
    coachName: null,
    lastSeenAt: null,
    online: false,
    ...overrides,
  };
}

describe("groupByCoach", () => {
  it("groups clients under their coach's header row", () => {
    const groups = groupByCoach([
      row({ userId: "coach-1", role: "coach", name: "Coach A", online: true, lastSeenAt: "t" }),
      row({ userId: "client-1", coachId: "coach-1", coachName: "Coach A", online: true }),
      row({ userId: "client-2", coachId: "coach-1", coachName: "Coach A", online: false }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].coach).toMatchObject({ id: "coach-1", name: "Coach A", online: true });
    expect(groups[0].clients.map((c) => c.userId)).toEqual(["client-1", "client-2"]);
    expect(groups[0].onlineCount).toBe(1);
  });

  it("puts clients with no coach_id in an Unassigned (coach: null) group", () => {
    const groups = groupByCoach([row({ userId: "orphan", coachId: null, online: true })]);

    expect(groups).toHaveLength(1);
    expect(groups[0].coach).toBeNull();
    expect(groups[0].onlineCount).toBe(1);
  });

  it("still produces a group for a coach with zero clients", () => {
    const groups = groupByCoach([row({ userId: "coach-2", role: "coach", name: "Coach B" })]);

    expect(groups).toHaveLength(1);
    expect(groups[0].coach).toMatchObject({ id: "coach-2" });
    expect(groups[0].clients).toEqual([]);
  });

  it("works when the coach row arrives after its clients in the input order", () => {
    const groups = groupByCoach([
      row({ userId: "client-1", coachId: "coach-1" }),
      row({ userId: "coach-1", role: "coach", name: "Coach A" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].coach).toMatchObject({ id: "coach-1", name: "Coach A" });
    expect(groups[0].clients).toHaveLength(1);
  });
});
