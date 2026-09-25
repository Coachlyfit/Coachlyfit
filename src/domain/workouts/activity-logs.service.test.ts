import { describe, expect, it } from "vitest";
import { ActivityLogsService } from "./activity-logs.service";

/** Hand-rolled thenable-chain fake, same style as programs.service.test.ts.
 * `parentRow` seeds program_activities' parent-derivation lookup (null
 * simulates RLS hiding the activity, or a template row with no client). */
function fakeSupabase(opts: { parentRow?: Record<string, unknown> | null; rows?: unknown[] } = {}) {
  const { parentRow = { coach_id: "coach-1", client_id: "client-1" }, rows = [] } = opts;
  const upserts: { table: string; payload: unknown; onConflict?: string }[] = [];

  const db = {
    from(table: string) {
      return {
        select: (cols?: string) => {
          if (cols === "coach_id, client_id") {
            return { eq: () => ({ maybeSingle: async () => ({ data: parentRow, error: null }) }) };
          }
          return {
            eq: () => ({
              eq: async () => ({ data: rows, error: null }),
              order: () => ({ limit: async () => ({ data: rows, error: null }) }),
            }),
          };
        },
        upsert: (payload: unknown, options?: { onConflict?: string }) => {
          upserts.push({ table, payload, onConflict: options?.onConflict });
          return { select: () => ({ single: async () => ({ data: { id: "log-1", ...(payload as object) }, error: null }) }) };
        },
        delete: () => ({
          eq: () => ({ select: async () => ({ data: [{ id: "1" }], error: null }) }),
        }),
      };
    },
  };

  return { db, upserts };
}

describe("ActivityLogsService", () => {
  describe("logActivity", () => {
    it("derives coach_id/client_id from the activity's parent row, never a caller argument", async () => {
      const { db, upserts } = fakeSupabase();
      const result = await new ActivityLogsService(db as never).logActivity("activity-1", { duration_min: 20 });

      expect(result).not.toBeNull();
      expect(upserts[0].payload).toMatchObject({ coach_id: "coach-1", client_id: "client-1", program_activity_id: "activity-1" });
      expect(upserts[0].onConflict).toBe("program_activity_id,performed_on");
    });

    it("returns null, inserting nothing, when the activity isn't visible (RLS)", async () => {
      const { db, upserts } = fakeSupabase({ parentRow: null });
      const result = await new ActivityLogsService(db as never).logActivity("activity-1", {});
      expect(result).toBeNull();
      expect(upserts).toHaveLength(0);
    });

    it("returns null for a template activity (client_id null) — nothing to log against", async () => {
      const { db, upserts } = fakeSupabase({ parentRow: { coach_id: "coach-1", client_id: null } });
      const result = await new ActivityLogsService(db as never).logActivity("activity-1", {});
      expect(result).toBeNull();
      expect(upserts).toHaveLength(0);
    });

    it("defaults performed_on to today when not given", async () => {
      const { db, upserts } = fakeSupabase();
      await new ActivityLogsService(db as never).logActivity("activity-1", {});
      const today = new Date().toISOString().slice(0, 10);
      expect((upserts[0].payload as { performed_on: string }).performed_on).toBe(today);
    });
  });
});
