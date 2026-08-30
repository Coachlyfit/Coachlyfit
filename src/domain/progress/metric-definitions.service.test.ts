import { describe, expect, it } from "vitest";
import { MetricDefinitionsService } from "./metric-definitions.service";

function fakeSupabase(opts: { affected?: unknown[] } = {}) {
  const { affected = [{ id: "1" }] } = opts;
  const inserts: { table: string; payload: unknown }[] = [];

  const db = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({ order: async () => ({ data: affected, error: null }) }),
        }),
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          return {
            select: () => ({
              single: async () => ({ data: { id: `new-${table}`, ...(payload as object) }, error: null }),
            }),
          };
        },
        delete: () => {
          const eqs: [string, unknown][] = [];
          const chain = {
            eq: (col: string, val: unknown) => {
              eqs.push([col, val]);
              return chain;
            },
            select: async () => ({ data: affected, error: null }),
          };
          return chain;
        },
      };
    },
  };

  return { db: db as never, inserts };
}

describe("MetricDefinitionsService", () => {
  describe("create", () => {
    it("stamps coach_id and derives key from label_en via slugifyMetricKey", async () => {
      const { db, inserts } = fakeSupabase();
      await new MetricDefinitionsService(db).create("coach-1", {
        label_ar: "محيط الرقبة",
        label_en: "Neck Circumference",
        unit: "cm",
      });

      expect(inserts[0].table).toBe("client_metric_definitions");
      expect(inserts[0].payload).toMatchObject({
        coach_id: "coach-1",
        key: "neck_circumference",
        label_ar: "محيط الرقبة",
        label_en: "Neck Circumference",
        unit: "cm",
      });
    });
  });

  describe("delete", () => {
    it("reports false on a 0-row RLS no-op instead of throwing", async () => {
      const { db } = fakeSupabase({ affected: [] });
      expect(await new MetricDefinitionsService(db).remove("def-1")).toBe(false);
    });

    it("reports true when a row was actually affected", async () => {
      const { db } = fakeSupabase({ affected: [{ id: "def-1" }] });
      expect(await new MetricDefinitionsService(db).remove("def-1")).toBe(true);
    });
  });
});
