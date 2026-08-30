import { describe, expect, it } from "vitest";
import { ClientBillingService } from "./client-billing.service";

/** Same hand-rolled thenable-chain fake as diet-plans.service.test.ts, pared
 * down: none of these tables derive coach_id/client_id from a parent row
 * (the caller already knows both, from the client detail page's own URL),
 * so there's no parent-lookup branch to seed here. */
function fakeSupabase(opts: { affected?: unknown[] } = {}) {
  const { affected = [{ id: "1" }] } = opts;

  const inserts: { table: string; payload: unknown }[] = [];
  const updates: { table: string; payload: unknown; eqs: [string, unknown][] }[] = [];
  const affectedRows = async () => ({ data: affected, error: null });

  const db = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: async () => ({ data: affected[0] ?? null, error: null }) }),
            }),
          }),
        }),
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          return {
            select: () => ({
              single: async () => ({ data: { id: `new-${table}`, ...(payload as object) }, error: null }),
            }),
          };
        },
        update: (payload: unknown) => {
          const eqs: [string, unknown][] = [];
          const chain = {
            eq: (col: string, val: unknown) => {
              eqs.push([col, val]);
              return chain;
            },
            select: affectedRows,
          };
          updates.push({ table, payload, eqs });
          return chain;
        },
      };
    },
  };

  return { db: db as never, inserts, updates };
}

describe("ClientBillingService", () => {
  describe("createSubscription", () => {
    it("stamps coach_id/client_id/package_id/status from the caller, defaulting status to active", async () => {
      const { db, inserts } = fakeSupabase();
      await new ClientBillingService(db).createSubscription("coach-1", {
        client_id: "client-9",
        package_id: "pkg-1",
        end_date: "2026-09-22",
      });

      expect(inserts[0].table).toBe("client_subscriptions");
      expect(inserts[0].payload).toMatchObject({
        coach_id: "coach-1",
        client_id: "client-9",
        package_id: "pkg-1",
        status: "active",
      });
    });
  });

  describe("status transitions", () => {
    it("freezeSubscription sets status=frozen and stamps frozen_at", async () => {
      const { db, updates } = fakeSupabase();
      const ok = await new ClientBillingService(db).freezeSubscription("sub-1");

      expect(ok).toBe(true);
      expect(updates[0].table).toBe("client_subscriptions");
      expect(updates[0].payload).toMatchObject({ status: "frozen" });
      expect(typeof (updates[0].payload as { frozen_at: string }).frozen_at).toBe("string");
      expect(updates[0].eqs).toEqual([["id", "sub-1"]]);
    });

    it("unfreezeSubscription sets status=active and clears frozen_at", async () => {
      const { db, updates } = fakeSupabase();
      const ok = await new ClientBillingService(db).unfreezeSubscription("sub-1");

      expect(ok).toBe(true);
      expect(updates[0].payload).toEqual({ status: "active", frozen_at: null });
    });

    it("cancelSubscription sets status=canceled", async () => {
      const { db, updates } = fakeSupabase();
      const ok = await new ClientBillingService(db).cancelSubscription("sub-1");

      expect(ok).toBe(true);
      expect(updates[0].payload).toEqual({ status: "canceled" });
    });

    it("reports false on a 0-row RLS no-op instead of throwing", async () => {
      const { db } = fakeSupabase({ affected: [] });
      expect(await new ClientBillingService(db).freezeSubscription("sub-1")).toBe(false);
    });
  });

  describe("recordTransaction", () => {
    it("stamps coach_id/client_id/recorded_by from the caller", async () => {
      const { db, inserts } = fakeSupabase();
      await new ClientBillingService(db).recordTransaction("coach-1", {
        client_id: "client-9",
        subscription_id: "sub-1",
        payment_method_id: "pm-1",
        amount_egp: 500,
        recorded_by: "coach-1",
      });

      expect(inserts[0].table).toBe("client_transactions");
      expect(inserts[0].payload).toMatchObject({
        coach_id: "coach-1",
        client_id: "client-9",
        subscription_id: "sub-1",
        payment_method_id: "pm-1",
        amount_egp: 500,
        recorded_by: "coach-1",
      });
    });
  });

  describe("getActiveSubscription", () => {
    it("returns null when the client has no subscription yet", async () => {
      const { db } = fakeSupabase({ affected: [] });
      expect(await new ClientBillingService(db).getActiveSubscription("client-9")).toBeNull();
    });
  });
});
