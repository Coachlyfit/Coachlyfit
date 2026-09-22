import { describe, expect, it } from "vitest";
import { DietPlansService } from "./diet-plans.service";

/** Same hand-rolled thenable-chain fake as programs.service.test.ts — no
 * mocking library. `parentRow` seeds what a parent-lookup select() resolves
 * to (or null, simulating RLS hiding it). */
function fakeSupabase(
  opts: {
    parentRow?: Record<string, unknown> | null;
    treeRow?: Record<string, unknown> | null;
    affected?: unknown[];
  } = {}
) {
  const { parentRow = null, treeRow = null, affected = [{ id: "1" }] } = opts;

  const inserts: { table: string; payload: unknown }[] = [];
  const updates: { table: string; payload: unknown; eqs: [string, unknown][] }[] = [];
  const deletes: { table: string; eqs: [string, unknown][] }[] = [];
  const affectedRows = async () => ({ data: affected, error: null });

  const db = {
    from(table: string) {
      return {
        select: (cols?: string) => {
          // Parent-derivation lookups: select("coach_id, client_id").eq(...).maybeSingle()
          if (cols === "coach_id, client_id") {
            return { eq: () => ({ maybeSingle: async () => ({ data: parentRow, error: null }) }) };
          }
          // getTree: select("*, meals(...)").eq(...).order().order().maybeSingle()
          // getActiveTreeForClient additionally chains .is("archived_at", null)
          // and .limit(1) before the same order/order/maybeSingle tail.
          const step2 = () => ({
            order: () => ({
              maybeSingle: async () => ({ data: treeRow, error: null }),
              limit: () => ({ maybeSingle: async () => ({ data: treeRow, error: null }) }),
            }),
          });
          const step1 = () => ({ order: () => step2() });
          return {
            eq: () => ({
              ...step1(),
              is: () => step1(),
            }),
            order: () => ({ ascending: undefined }),
          };
        },
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
        delete: () => {
          const eqs: [string, unknown][] = [];
          const chain = {
            eq: (col: string, val: unknown) => {
              eqs.push([col, val]);
              return chain;
            },
            select: affectedRows,
          };
          deletes.push({ table, eqs });
          return chain;
        },
      };
    },
  };

  return { db: db as never, inserts, updates, deletes };
}

describe("DietPlansService", () => {
  describe("child tenant derivation (security)", () => {
    it("addMeal takes coach_id/client_id from the parent diet_plan row, not from any argument", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: { coach_id: "coach-1", client_id: "client-9" } });
      await new DietPlansService(db).addMeal("plan-1", { label_ar: "فطار" });

      expect(inserts[0].table).toBe("meals");
      expect(inserts[0].payload).toMatchObject({
        coach_id: "coach-1",
        client_id: "client-9",
        diet_plan_id: "plan-1",
      });
    });

    it("addItem takes coach_id/client_id from the parent meal row", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: { coach_id: "coach-1", client_id: "client-9" } });
      await new DietPlansService(db).addItem("meal-1", { food_id: "food-1" });

      expect(inserts[0].table).toBe("meal_items");
      expect(inserts[0].payload).toMatchObject({
        coach_id: "coach-1",
        client_id: "client-9",
        meal_id: "meal-1",
        food_id: "food-1",
      });
    });

    it("addMeal returns null and inserts nothing when the parent plan isn't visible", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: null });
      const result = await new DietPlansService(db).addMeal("plan-1", { label_ar: "فطار" });

      expect(result).toBeNull();
      expect(inserts).toHaveLength(0);
    });

    it("addItem returns null and inserts nothing when the parent meal isn't visible", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: null });
      const result = await new DietPlansService(db).addItem("meal-1", { food_id: "food-1" });

      expect(result).toBeNull();
      expect(inserts).toHaveLength(0);
    });
  });

  describe("addItem defaults", () => {
    it("defaults quantity to 1 and unit to 'serving' when omitted", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: { coach_id: "coach-1", client_id: "client-9" } });
      await new DietPlansService(db).addItem("meal-1", { food_id: "food-1" });

      expect(inserts[0].payload).toMatchObject({ quantity: 1, unit: "serving" });
    });

    it("keeps a caller-supplied quantity/unit", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: { coach_id: "coach-1", client_id: "client-9" } });
      await new DietPlansService(db).addItem("meal-1", { food_id: "food-1", quantity: 2.5, unit: "cup" });

      expect(inserts[0].payload).toMatchObject({ quantity: 2.5, unit: "cup" });
    });
  });

  describe("write results", () => {
    it("update/remove/updateMeal/removeItem report false on a 0-row RLS no-op", async () => {
      const { db } = fakeSupabase({ affected: [] });
      const svc = new DietPlansService(db);
      expect(await svc.update("p1", { name_ar: "x" })).toBe(false);
      expect(await svc.remove("p1")).toBe(false);
      expect(await svc.updateMeal("m1", { label_ar: "x" })).toBe(false);
      expect(await svc.removeItem("i1")).toBe(false);
    });

    it("reports true when a row was actually affected", async () => {
      const { db } = fakeSupabase({ affected: [{ id: "p1" }] });
      expect(await new DietPlansService(db).remove("p1")).toBe(true);
    });
  });

  describe("reorderItems", () => {
    it("writes order_index = array position and scopes each update by the parent meal id", async () => {
      const { db, updates } = fakeSupabase();
      const count = await new DietPlansService(db).reorderItems("meal-1", ["i-c", "i-a", "i-b"]);

      expect(count).toBe(3);
      expect(updates).toHaveLength(3);
      updates.forEach((u, i) => {
        expect(u.table).toBe("meal_items");
        expect(u.payload).toEqual({ order_index: i });
        expect(u.eqs).toEqual([
          ["id", ["i-c", "i-a", "i-b"][i]],
          ["meal_id", "meal-1"],
        ]);
      });
    });
  });

  describe("cloneToClient", () => {
    it("stamps the new client_id on plan/meals/items and records source_template_id", async () => {
      const tree = {
        id: "template-1",
        coach_id: "coach-1",
        client_id: null,
        name_ar: "خطة",
        name_en: "Plan",
        start_date: "2026-08-01",
        end_date: null,
        meals: [
          {
            id: "meal-1",
            order_index: 0,
            label_ar: "فطار",
            label_en: "Breakfast",
            meal_items: [
              { id: "item-1", food_id: "food-1", quantity: 2, unit: "serving", order_index: 0 },
            ],
          },
        ],
      };
      const { db, inserts } = fakeSupabase({ treeRow: tree });
      const result = await new DietPlansService(db).cloneToClient("template-1", "client-9");

      expect(result).not.toBeNull();
      const planInsert = inserts.find((i) => i.table === "diet_plans");
      const mealInsert = inserts.find((i) => i.table === "meals");
      const itemInsert = inserts.find((i) => i.table === "meal_items");

      expect(planInsert?.payload).toMatchObject({
        client_id: "client-9",
        coach_id: "coach-1",
        source_template_id: "template-1",
      });
      expect(mealInsert?.payload).toMatchObject({ client_id: "client-9", coach_id: "coach-1" });
      expect(itemInsert?.payload).toEqual([
        expect.objectContaining({
          client_id: "client-9",
          coach_id: "coach-1",
          food_id: "food-1",
          quantity: 2,
          unit: "serving",
        }),
      ]);
    });

    it("returns null without inserting when the template tree isn't visible", async () => {
      const { db, inserts } = fakeSupabase({ treeRow: null });
      const result = await new DietPlansService(db).cloneToClient("template-1", "client-9");

      expect(result).toBeNull();
      expect(inserts).toHaveLength(0);
    });

    it("saveAsTemplate clones an assigned plan back to client_id null with no source_template_id and no end_date", async () => {
      const assigned = {
        id: "plan-1",
        coach_id: "coach-1",
        client_id: "client-9",
        name_ar: "خطة",
        name_en: "Plan",
        start_date: "2026-08-01",
        end_date: "2026-09-01",
        meals: [],
      };
      const { db, inserts } = fakeSupabase({ treeRow: assigned });
      const result = await new DietPlansService(db).saveAsTemplate("plan-1", "قالب جديد", "New template");

      expect(result).not.toBeNull();
      const planInsert = inserts.find((i) => i.table === "diet_plans");
      expect(planInsert?.payload).toMatchObject({
        client_id: null,
        source_template_id: null,
        end_date: null,
        name_ar: "قالب جديد",
        name_en: "New template",
      });
    });
  });

  describe("getActiveTreeForClient", () => {
    it("scopes by client_id and takes the most recently created plan", async () => {
      const eqCalls: [string, unknown][] = [];
      const tree = { id: "plan-1", client_id: "client-9" };
      const db = {
        from: () => ({
          select: () => ({
            eq: (col: string, val: unknown) => {
              eqCalls.push([col, val]);
              return {
                is: () => ({
                  order: () => ({
                    order: () => ({
                      order: () => ({
                        limit: () => ({ maybeSingle: async () => ({ data: tree, error: null }) }),
                      }),
                    }),
                  }),
                }),
              };
            },
          }),
        }),
      };

      const result = await new DietPlansService(db as never).getActiveTreeForClient("client-9");

      expect(result).toEqual(tree);
      expect(eqCalls).toEqual([["client_id", "client-9"]]);
    });
  });
});
