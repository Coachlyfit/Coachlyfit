import { describe, expect, it } from "vitest";
import { CoachSubscriptionService } from "./coach-subscription.service";

/** Hand-rolled fake (same approach as client-billing.service.test.ts):
 * records what the service sends and answers with a canned result. */
function fakeSupabase(opts: { error?: { code: string } | null; deleted?: unknown[] } = {}) {
  const { error = null, deleted = [{ id: "r1" }] } = opts;
  const inserts: { table: string; payload: unknown }[] = [];
  const deletes: { table: string; eqs: [string, unknown][] }[] = [];
  const rpcs: { fn: string; args: unknown }[] = [];

  const db = {
    from(table: string) {
      return {
        insert: async (payload: unknown) => {
          inserts.push({ table, payload });
          return { error };
        },
        delete: () => {
          const eqs: [string, unknown][] = [];
          const chain = {
            eq: (col: string, val: unknown) => {
              eqs.push([col, val]);
              return chain;
            },
            select: async () => ({ data: deleted, error: null }),
          };
          deletes.push({ table, eqs });
          return chain;
        },
      };
    },
    rpc: async (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      return { error };
    },
  };

  return { db: db as never, inserts, deletes, rpcs };
}

describe("CoachSubscriptionService", () => {
  it("sends the tier only for a plan change", async () => {
    const { db, inserts } = fakeSupabase();
    const service = new CoachSubscriptionService(db);

    await service.createRequest("coach-1", { type: "change_plan", tierId: "tier-9", note: "  more clients  " });
    await service.createRequest("coach-1", { type: "other", tierId: "tier-9", note: "" });

    expect(inserts[0]).toEqual({
      table: "subscription_requests",
      payload: { coach_id: "coach-1", type: "change_plan", tier_id: "tier-9", note: "more clients" },
    });
    expect(inserts[1].payload).toEqual({ coach_id: "coach-1", type: "other", tier_id: null, note: null });
  });

  it("returns the Postgres error code when the insert is refused", async () => {
    const { db } = fakeSupabase({ error: { code: "23505" } });
    expect(await new CoachSubscriptionService(db).createRequest("coach-1", { type: "reactivate" })).toBe("23505");
  });

  it("only withdraws a pending request and reports whether one was removed", async () => {
    const hit = fakeSupabase();
    expect(await new CoachSubscriptionService(hit.db).withdrawRequest("r1")).toBe(true);
    expect(hit.deletes[0].eqs).toEqual([
      ["id", "r1"],
      ["status", "pending"],
    ]);

    const miss = fakeSupabase({ deleted: [] });
    expect(await new CoachSubscriptionService(miss.db).withdrawRequest("r1")).toBe(false);
  });

  it("flips cancel-at-period-end through the owner-checked RPC", async () => {
    const { db, rpcs } = fakeSupabase();
    expect(await new CoachSubscriptionService(db).setCancelAtPeriodEnd(true)).toBeNull();
    expect(rpcs).toEqual([{ fn: "set_my_subscription_cancel", args: { p_cancel: true } }]);
  });
});
