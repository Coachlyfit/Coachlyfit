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
    ownClientRow?: Record<string, unknown> | null;
    sourceMeal?: Record<string, unknown> | null;
    childCount?: number;
  } = {}
) {
  const {
    parentRow = null,
    treeRow = null,
    affected = [{ id: "1" }],
    ownClientRow = { id: "client-1" },
    sourceMeal = null,
    childCount = 0,
  } = opts;

  const inserts: { table: string; payload: unknown }[] = [];
  const updates: { table: string; payload: unknown; eqs: [string, unknown][] }[] = [];
  const deletes: { table: string; eqs: [string, unknown][] }[] = [];
  const affectedRows = async () => ({ data: affected, error: null });

  const db = {
    from(table: string) {
      return {
        select: (cols?: string, selectOpts?: { head?: boolean }) => {
          // nextIndex: select("id", { count, head }).eq(...) resolves a count.
          if (selectOpts?.head) {
            return { eq: async () => ({ count: childCount, error: null }) };
          }
          // copyMeal's source-meal read.
          if (cols?.startsWith("label_ar")) {
            return { eq: () => ({ maybeSingle: async () => ({ data: sourceMeal, error: null }) }) };
          }
          // Parent-derivation lookups: select("coach_id, client_id").eq(...).maybeSingle()
          if (cols === "coach_id, client_id") {
            return { eq: () => ({ maybeSingle: async () => ({ data: parentRow, error: null }) }) };
          }
          // assertOwnClient: select("id").eq(...).maybeSingle()
          if (cols === "id" && table === "clients") {
            return { eq: () => ({ maybeSingle: async () => ({ data: ownClientRow, error: null }) }) };
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
            then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
          };
        },
        update: (payload: unknown) => {
          const eqs: [string, unknown][] = [];
          const chain = {
            eq: (col: string, val: unknown) => {
              eqs.push([col, val]);
              return chain;
            },
            neq: (col: string, val: unknown) => {
              eqs.push([col, val]);
              return chain;
            },
            is: (col: string, val: unknown) => {
              eqs.push([col, val]);
              return chain;
            },
            select: affectedRows,
            // cloneToClient's replaceActive branch awaits the chain
            // directly with no .select() tail — see ProgramsService's test.
            then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
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

    it("starts the cloned plan today, not on the template's own start_date", async () => {
      const tree = {
        id: "template-1",
        coach_id: "coach-1",
        client_id: null,
        name_ar: "خطة",
        name_en: "Plan",
        start_date: "2026-08-01",
        end_date: null,
        meals: [],
      };
      const { db, inserts } = fakeSupabase({ treeRow: tree });
      await new DietPlansService(db).cloneToClient("template-1", "client-9");

      const planInsert = inserts.find((i) => i.table === "diet_plans");
      const today = new Date().toISOString().slice(0, 10);
      expect((planInsert?.payload as { start_date: string }).start_date).toBe(today);
    });

    it("replaceActive archives the client's other active plans after cloning, leaving the clone alone", async () => {
      const tree = {
        id: "template-1",
        coach_id: "coach-1",
        client_id: null,
        name_ar: "خطة",
        name_en: "Plan",
        start_date: "2026-08-01",
        end_date: null,
        meals: [],
      };
      const { db, updates } = fakeSupabase({ treeRow: tree });
      const result = await new DietPlansService(db).cloneToClient("template-1", "client-9", true);

      const archiveUpdate = updates.find((u) => u.table === "diet_plans");
      expect(archiveUpdate?.payload).toMatchObject({ archived_at: expect.any(String) });
      expect(archiveUpdate?.eqs).toContainEqual(["client_id", "client-9"]);
      expect(archiveUpdate?.eqs).toContainEqual(["archived_at", null]);
      expect(archiveUpdate?.eqs).toContainEqual(["id", result?.id]);
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
                  is: () => ({
                    order: () => ({
                      order: () => ({
                        order: () => ({
                          limit: () => ({ maybeSingle: async () => ({ data: tree, error: null }) }),
                        }),
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

  describe("ordering", () => {
    it("appends a new meal/item after its existing siblings instead of at order_index 0", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: { coach_id: "c", client_id: "k" }, childCount: 3 });
      const svc = new DietPlansService(db);
      await svc.addMeal("plan-1", {});
      await svc.addItem("meal-1", { food_id: "food-1" });
      expect(inserts[0].payload).toMatchObject({ order_index: 3 });
      expect(inserts[1].payload).toMatchObject({ order_index: 3 });
    });

    it("addMeals numbers a batch consecutively from the end", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: { coach_id: "c", client_id: "k" }, childCount: 1 });
      await new DietPlansService(db).addMeals("plan-1", [{ label_en: "A" }, { label_en: "B" }]);
      expect(inserts[0].payload).toEqual([
        expect.objectContaining({ order_index: 1, label_en: "A", diet_plan_id: "plan-1" }),
        expect.objectContaining({ order_index: 2, label_en: "B", diet_plan_id: "plan-1" }),
      ]);
    });
  });

  describe("copyMeal", () => {
    it("copies label/time/items onto the target plan with the TARGET's tenant columns", async () => {
      const { db, inserts } = fakeSupabase({
        parentRow: { coach_id: "coach-1", client_id: "client-rest" },
        sourceMeal: {
          label_ar: "فطار",
          label_en: "Breakfast",
          time_of_day: "08:00",
          meal_items: [{ food_id: "food-1", quantity: 2, unit: "100g", order_index: 0 }],
        },
      });
      const meal = await new DietPlansService(db).copyMeal("meal-1", "plan-rest");

      expect(meal).not.toBeNull();
      expect(inserts[0]).toMatchObject({
        table: "meals",
        payload: { diet_plan_id: "plan-rest", client_id: "client-rest", label_en: "Breakfast", time_of_day: "08:00" },
      });
      expect(inserts[1].table).toBe("meal_items");
      expect(inserts[1].payload).toEqual([
        expect.objectContaining({ meal_id: "new-meals", client_id: "client-rest", food_id: "food-1", quantity: 2 }),
      ]);
    });

    it("returns null and inserts nothing when the source meal isn't visible", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: { coach_id: "c", client_id: "k" }, sourceMeal: null });
      expect(await new DietPlansService(db).copyMeal("meal-1", "plan-1")).toBeNull();
      expect(inserts).toHaveLength(0);
    });
  });
});
