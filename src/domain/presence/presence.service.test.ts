import { describe, expect, it } from "vitest";
import { PresenceService } from "./presence.service";

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

  it("adminSummary() maps the aggregate json to camelCase", async () => {
    const { db, calls } = fakeSupabase({
      data: {
        coach_total: 1,
        client_total: 2,
        active_today: 1,
        active_7d: 2,
        never_count: 1,
        coaches: [{ id: "c1", name: "Coach", last_seen_at: null, client_total: 2, client_user_ids: ["u1"] }],
      },
      error: null,
    });

    const summary = await new PresenceService(db).adminSummary();
    expect(calls[0].fn).toBe("admin_online_summary");
    expect(summary).toMatchObject({ coachTotal: 1, clientTotal: 2, activeToday: 1, active7d: 2, neverCount: 1 });
    expect(summary.coaches[0]).toEqual({ id: "c1", name: "Coach", lastSeenAt: null, clientTotal: 2, clientUserIds: ["u1"] });
  });

  it("adminCoachClients() asks for one coach and keeps account-less clients (userId null)", async () => {
    const { db, calls } = fakeSupabase({
      data: [{ client_id: "cl1", user_id: null, name: "Invited", last_seen_at: null, can_invite: true }],
      error: null,
    });

    const rows = await new PresenceService(db).adminCoachClients("c1");
    expect(calls[0]).toEqual({ fn: "admin_coach_clients", args: { p_coach_id: "c1" } });
    expect(rows).toEqual([{ clientId: "cl1", userId: null, name: "Invited", lastSeenAt: null, canInvite: true }]);
  });
});
