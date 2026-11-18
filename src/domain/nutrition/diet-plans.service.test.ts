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
    sourceDay?: Record<string, unknown> | null;
    dayRow?: Record<string, unknown> | null;
    childCount?: number;
    overviewRows?: Record<string, unknown>[];
  } = {}
) {
  const {
    overviewRows = [],
    parentRow = null,
    treeRow = null,
    affected = [{ id: "1" }],
    ownClientRow = { id: "client-1" },
    sourceMeal = null,
    sourceDay = null,
    dayRow = null,
    childCount = 0,
  } = opts;

  const inserts: { table: string; payload: unknown }[] = [];
  const updates: { table: string; payload: unknown; eqs: [string, unknown][] }[] = [];
  const deletes: { table: string; eqs: [string, unknown][] }[] = [];
  /** Every .eq() a parent lookup made, so a test can see what it was scoped by. */
  const lookups: [string, string, unknown][] = [];
  const insertCounts = new Map<string, number>();
  const affectedRows = async () => ({ data: affected, error: null });

  // The first insert into a table gets id `new-<table>`, later ones
  // `new-<table>-2`, `-3`… so a test that creates several rows can tell them apart.
  const nextId = (table: string) => {
    const n = (insertCounts.get(table) ?? 0) + 1;
    insertCounts.set(table, n);
    return n === 1 ? `new-${table}` : `new-${table}-${n}`;
  };

  const db = {
    from(table: string) {
      return {
        select: (cols?: string, selectOpts?: { head?: boolean }) => {
          // nextIndex / dayCount: select("id", { count, head }).eq(...) resolves a count.
          if (selectOpts?.head) {
            return { eq: async () => ({ count: childCount, error: null }) };
          }
          // listOverview: select("*, clients(...), diet_plan_days(...), meals(id, ...)").is().is().order()
          if (cols?.includes("meals(id")) {
            const chain = { is: () => chain, order: async () => ({ data: overviewRows, error: null }) };
            return chain;
          }
          // duplicateDay's source read: select("*, meals(...)").eq().order().maybeSingle()
          if (cols?.startsWith("*, meals(label_ar")) {
            return { eq: () => ({ order: () => ({ maybeSingle: async () => ({ data: sourceDay, error: null }) }) }) };
          }
          // copyMeal's source-meal read.
          if (cols?.startsWith("label_ar")) {
            return { eq: () => ({ maybeSingle: async () => ({ data: sourceMeal, error: null }) }) };
          }
          // removeDay's day lookup.
          if (cols === "diet_plan_id") {
            return { eq: () => ({ maybeSingle: async () => ({ data: dayRow, error: null }) }) };
          }
          // Parent-derivation lookups (plan or day row):
          // select("coach_id, client_id").eq(...)[.eq(...)].maybeSingle()
          if (cols === "coach_id, client_id") {
            const chain = {
              eq: (col: string, val: unknown) => {
                lookups.push([table, col, val]);
                return chain;
              },
              maybeSingle: async () => ({ data: parentRow, error: null }),
            };
            return chain;
          }
          // assertOwnClient: select("id").eq(...).maybeSingle()
          if (cols === "id" && table === "clients") {
            return { eq: () => ({ maybeSingle: async () => ({ data: ownClientRow, error: null }) }) };
          }
          // getTree: select(TREE).eq(...).order().order().order().maybeSingle()
          // getActiveTreeForClient additionally chains .is("archived_at", null)
          // and .limit(1) before the same order…/maybeSingle tail.
          const tail: Record<string, unknown> = {
            order: () => tail,
            limit: () => tail,
            maybeSingle: async () => ({ data: treeRow, error: null }),
          };
          return {
            eq: () => ({ ...tail, is: () => tail }),
            order: () => ({ ascending: undefined }),
          };
        },
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          return {
            select: () => ({
              single: async () => ({ data: { id: nextId(table), ...(payload as object) }, error: null }),
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

  return { db: db as never, inserts, updates, deletes, lookups };
}

describe("DietPlansService", () => {
  describe("listOverview", () => {
    it("adds meal count and planned kcal, and drops the nested meals and days", async () => {
      const food = { kcal: 100, protein_g: 10, carb_g: 10, fat_g: 2 };
      const { db } = fakeSupabase({
        overviewRows: [
          {
            id: "p1",
            diet_plan_days: [{ id: "d1", order_index: 0 }],
            meals: [
              { id: "m1", diet_plan_day_id: "d1", meal_items: [{ quantity: 1.5, foods: food }, { quantity: 2, foods: food }] },
              { id: "m2", diet_plan_day_id: "d1", meal_items: [] },
            ],
          },
          { id: "p2", diet_plan_days: [{ id: "d2", order_index: 0 }], meals: [] },
        ],
      });

      expect(await new DietPlansService(db).listOverview()).toEqual([
        { id: "p1", mealCount: 2, plannedKcal: 350 },
        { id: "p2", mealCount: 0, plannedKcal: 0 },
      ]);
    });

    it("counts only the plan's first day, not every day summed together", async () => {
      const food = { kcal: 100, protein_g: 10, carb_g: 10, fat_g: 2 };
      const { db } = fakeSupabase({
        overviewRows: [
          {
            id: "p1",
            // Listed out of order on purpose: "first" is by order_index.
            diet_plan_days: [
              { id: "rest", order_index: 1 },
              { id: "train", order_index: 0 },
            ],
            meals: [
              { id: "m1", diet_plan_day_id: "train", meal_items: [{ quantity: 2, foods: food }] },
              { id: "m2", diet_plan_day_id: "rest", meal_items: [{ quantity: 10, foods: food }] },
            ],
          },
        ],
      });

      expect(await new DietPlansService(db).listOverview()).toEqual([{ id: "p1", mealCount: 1, plannedKcal: 200 }]);
    });
  });

  describe("child tenant derivation (security)", () => {
    it("addMeal takes coach_id/client_id from the parent day row, not from any argument", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: { coach_id: "coach-1", client_id: "client-9" } });
      await new DietPlansService(db).addMeal("plan-1", "day-1", { label_ar: "فطار" });

      expect(inserts[0].table).toBe("meals");
      expect(inserts[0].payload).toMatchObject({
        coach_id: "coach-1",
        client_id: "client-9",
        diet_plan_id: "plan-1",
        diet_plan_day_id: "day-1",
      });
    });

    it("addMeal looks the day up scoped by BOTH its id and the plan, so another plan's day is refused", async () => {
      const { db, lookups } = fakeSupabase({ parentRow: { coach_id: "coach-1", client_id: "client-9" } });
      await new DietPlansService(db).addMeal("plan-1", "day-of-another-plan", {});

      expect(lookups).toEqual([
        ["diet_plan_days", "id", "day-of-another-plan"],
        ["diet_plan_days", "diet_plan_id", "plan-1"],
      ]);
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

    it("addMeal returns null and inserts nothing when the day isn't visible or isn't part of the plan", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: null });
      const result = await new DietPlansService(db).addMeal("plan-1", "day-1", { label_ar: "فطار" });

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

  describe("renameDiet", () => {
    it("writes only the two names, scoped to the plan id", async () => {
      const { db, updates } = fakeSupabase();
      const renamed = await new DietPlansService(db).renameDiet("p1", { name_ar: "خطة", name_en: "Plan" });

      expect(renamed).toBe(true);
      expect(updates).toHaveLength(1);
      expect(updates[0].table).toBe("diet_plans");
      expect(updates[0].payload).toEqual({ name_ar: "خطة", name_en: "Plan" });
      expect(updates[0].eqs).toEqual([["id", "p1"]]);
    });

    it("reports false when RLS hides the plan (not this coach's row)", async () => {
      const { db } = fakeSupabase({ affected: [] });
      expect(await new DietPlansService(db).renameDiet("p1", { name_ar: "x", name_en: "x" })).toBe(false);
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

  describe("create", () => {
    it("gives the new plan its one default day, carrying the plan's targets", async () => {
      const { db, inserts } = fakeSupabase();
      await new DietPlansService(db).create("coach-1", {
        name_ar: "خطة",
        name_en: "Plan",
        target_kcal: 2200,
        target_protein_g: 160,
        target_carb_g: 230,
        target_fat_g: 70,
      });

      expect(inserts.map((i) => i.table)).toEqual(["diet_plans", "diet_plan_days"]);
      expect(inserts[1].payload).toMatchObject({
        diet_plan_id: "new-diet_plans",
        coach_id: "coach-1",
        client_id: null,
        name_en: "Every day",
        kind: "custom",
        order_index: 0,
        target_kcal: 2200,
        target_protein_g: 160,
        target_carb_g: 230,
        target_fat_g: 70,
      });
    });
  });

  describe("cloneToClient", () => {
    const oneDay = [{ id: "day-1", name_ar: "كل الأيام", name_en: "Every day", kind: "custom", order_index: 0 }];

    it("stamps the new client_id on plan/day/meals/items and records source_template_id", async () => {
      const tree = {
        id: "template-1",
        coach_id: "coach-1",
        client_id: null,
        name_ar: "خطة",
        name_en: "Plan",
        start_date: "2026-08-01",
        end_date: null,
        diet_plan_days: oneDay,
        diet_plan_schedule: [],
        meals: [
          {
            id: "meal-1",
            diet_plan_day_id: "day-1",
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
      const dayInsert = inserts.find((i) => i.table === "diet_plan_days");
      const mealInsert = inserts.find((i) => i.table === "meals");
      const itemInsert = inserts.find((i) => i.table === "meal_items");

      expect(planInsert?.payload).toMatchObject({
        client_id: "client-9",
        coach_id: "coach-1",
        source_template_id: "template-1",
      });
      expect(dayInsert?.payload).toMatchObject({
        diet_plan_id: "new-diet_plans",
        client_id: "client-9",
        coach_id: "coach-1",
        name_en: "Every day",
      });
      expect(mealInsert?.payload).toMatchObject({
        client_id: "client-9",
        coach_id: "coach-1",
        diet_plan_id: "new-diet_plans",
        diet_plan_day_id: "new-diet_plan_days",
      });
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

    it("clones every day with its own meals and remaps the weekly schedule to the new day ids", async () => {
      const tree = {
        id: "template-1",
        coach_id: "coach-1",
        client_id: null,
        name_ar: "خطة",
        name_en: "Plan",
        start_date: "2026-08-01",
        end_date: null,
        diet_plan_days: [
          {
            id: "d-train",
            name_ar: "تمرين",
            name_en: "Training",
            kind: "training",
            order_index: 0,
            target_kcal: 2600,
            target_protein_g: 170,
            target_carb_g: 300,
            target_fat_g: 70,
            notes_ar: null,
            notes_en: "Eat early",
          },
          {
            id: "d-rest",
            name_ar: "راحة",
            name_en: "Rest",
            kind: "rest",
            order_index: 1,
            target_kcal: 2200,
            target_protein_g: 170,
            target_carb_g: 200,
            target_fat_g: 70,
            notes_ar: null,
            notes_en: null,
          },
        ],
        diet_plan_schedule: [
          { diet_plan_id: "template-1", weekday: 5, diet_plan_day_id: "d-rest" },
          { diet_plan_id: "template-1", weekday: 1, diet_plan_day_id: "d-train" },
        ],
        meals: [
          { id: "m-t", diet_plan_day_id: "d-train", order_index: 0, label_en: "Pre", label_ar: null, meal_items: [] },
          { id: "m-r", diet_plan_day_id: "d-rest", order_index: 0, label_en: "Light", label_ar: null, meal_items: [] },
        ],
      };
      const { db, inserts } = fakeSupabase({ treeRow: tree });
      await new DietPlansService(db).cloneToClient("template-1", "client-9");

      const days = inserts.filter((i) => i.table === "diet_plan_days").map((i) => i.payload);
      expect(days).toEqual([
        expect.objectContaining({ name_en: "Training", kind: "training", target_kcal: 2600, notes_en: "Eat early", client_id: "client-9" }),
        expect.objectContaining({ name_en: "Rest", kind: "rest", target_kcal: 2200, order_index: 1, client_id: "client-9" }),
      ]);

      // Each meal lands under the clone of ITS day, not the first one.
      const meals = inserts.filter((i) => i.table === "meals").map((i) => i.payload);
      expect(meals).toEqual([
        expect.objectContaining({ label_en: "Pre", diet_plan_day_id: "new-diet_plan_days" }),
        expect.objectContaining({ label_en: "Light", diet_plan_day_id: "new-diet_plan_days-2" }),
      ]);

      const schedule = inserts.find((i) => i.table === "diet_plan_schedule");
      expect(schedule?.payload).toEqual([
        { diet_plan_id: "new-diet_plans", weekday: 5, diet_plan_day_id: "new-diet_plan_days-2", coach_id: "coach-1", client_id: "client-9" },
        { diet_plan_id: "new-diet_plans", weekday: 1, diet_plan_day_id: "new-diet_plan_days", coach_id: "coach-1", client_id: "client-9" },
      ]);
    });

    it("gives a day-less tree the one default day the clone needs", async () => {
      const tree = {
        id: "template-1",
        coach_id: "coach-1",
        client_id: null,
        name_ar: "خطة",
        name_en: "Plan",
        start_date: "2026-08-01",
        end_date: null,
        diet_plan_days: [],
        diet_plan_schedule: [],
        meals: [],
      };
      const { db, inserts } = fakeSupabase({ treeRow: tree });
      await new DietPlansService(db).cloneToClient("template-1", "client-9");

      expect(inserts.filter((i) => i.table === "diet_plan_days")).toHaveLength(1);
      expect(inserts.find((i) => i.table === "diet_plan_schedule")).toBeUndefined();
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
        diet_plan_days: oneDay,
        diet_plan_schedule: [],
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
        diet_plan_days: oneDay,
        diet_plan_schedule: [],
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
        diet_plan_days: oneDay,
        diet_plan_schedule: [],
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
      const tree = { id: "plan-1", client_id: "client-9", meals: [] };
      // order(created_at), order(days), order(meals), order(meal_items), limit(1)
      const tail = { limit: () => ({ maybeSingle: async () => ({ data: tree, error: null }) }) };
      const db = {
        from: () => ({
          select: () => ({
            eq: (col: string, val: unknown) => {
              eqCalls.push([col, val]);
              return {
                is: () => ({
                  is: () => ({
                    order: () => ({ order: () => ({ order: () => ({ order: () => tail }) }) }),
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
      await svc.addMeal("plan-1", "day-1", {});
      await svc.addItem("meal-1", { food_id: "food-1" });
      expect(inserts[0].payload).toMatchObject({ order_index: 3 });
      expect(inserts[1].payload).toMatchObject({ order_index: 3 });
    });

    it("addMeals numbers a batch consecutively from the end of the day", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: { coach_id: "c", client_id: "k" }, childCount: 1 });
      await new DietPlansService(db).addMeals("plan-1", "day-1", [{ label_en: "A" }, { label_en: "B" }]);
      expect(inserts[0].payload).toEqual([
        expect.objectContaining({ order_index: 1, label_en: "A", diet_plan_id: "plan-1", diet_plan_day_id: "day-1" }),
        expect.objectContaining({ order_index: 2, label_en: "B", diet_plan_id: "plan-1", diet_plan_day_id: "day-1" }),
      ]);
    });
  });

  describe("copyMeal", () => {
    it("copies label/time/items onto the target day with the TARGET's tenant columns", async () => {
      const { db, inserts } = fakeSupabase({
        parentRow: { coach_id: "coach-1", client_id: "client-rest" },
        sourceMeal: {
          label_ar: "فطار",
          label_en: "Breakfast",
          time_of_day: "08:00",
          meal_items: [{ food_id: "food-1", quantity: 2, unit: "100g", order_index: 0 }],
        },
      });
      const meal = await new DietPlansService(db).copyMeal("meal-1", "plan-rest", "day-rest");

      expect(meal).not.toBeNull();
      expect(inserts[0]).toMatchObject({
        table: "meals",
        payload: {
          diet_plan_id: "plan-rest",
          diet_plan_day_id: "day-rest",
          client_id: "client-rest",
          label_en: "Breakfast",
          time_of_day: "08:00",
        },
      });
      expect(inserts[1].table).toBe("meal_items");
      expect(inserts[1].payload).toEqual([
        expect.objectContaining({ meal_id: "new-meals", client_id: "client-rest", food_id: "food-1", quantity: 2 }),
      ]);
    });

    it("returns null and inserts nothing when the source meal isn't visible", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: { coach_id: "c", client_id: "k" }, sourceMeal: null });
      expect(await new DietPlansService(db).copyMeal("meal-1", "plan-1", "day-1")).toBeNull();
      expect(inserts).toHaveLength(0);
    });
  });

  describe("duplicateDay", () => {
    const sourceDay = {
      id: "day-1",
      diet_plan_id: "plan-1",
      coach_id: "coach-1",
      client_id: "client-9",
      name_ar: "تمرين",
      name_en: "Training",
      kind: "training",
      order_index: 0,
      target_kcal: 2600,
      target_protein_g: 170,
      target_carb_g: 300,
      target_fat_g: 70,
      notes_ar: null,
      notes_en: "Eat early",
      created_by: "user-1",
      created_at: "2026-11-01T00:00:00Z",
      meals: [
        {
          label_ar: "فطار",
          label_en: "Breakfast",
          time_of_day: "08:00",
          order_index: 0,
          meal_items: [
            { food_id: "food-1", recipe_id: null, quantity: 2, unit: "serving", order_index: 0 },
            { food_id: null, recipe_id: "recipe-1", quantity: 1.5, unit: "serving", order_index: 1 },
          ],
        },
        {
          label_ar: "غداء",
          label_en: "Lunch",
          time_of_day: "13:00",
          order_index: 1,
          meal_items: [{ food_id: "food-2", recipe_id: null, quantity: 3, unit: "100g", order_index: 0 }],
        },
      ],
    };

    it("copies the day's targets and notes under the new names, at the end of the same plan", async () => {
      const { db, inserts } = fakeSupabase({ sourceDay, childCount: 2 });
      const copy = await new DietPlansService(db).duplicateDay("day-1", "تمرين (نسخة)", "Training (copy)");

      expect(copy).not.toBeNull();
      const dayInsert = inserts.find((i) => i.table === "diet_plan_days")?.payload as Record<string, unknown>;
      expect(dayInsert).toMatchObject({
        diet_plan_id: "plan-1",
        coach_id: "coach-1",
        client_id: "client-9",
        name_ar: "تمرين (نسخة)",
        name_en: "Training (copy)",
        kind: "training",
        order_index: 2,
        target_kcal: 2600,
        target_protein_g: 170,
        target_carb_g: 300,
        target_fat_g: 70,
        notes_en: "Eat early",
      });
      // The copy is a new row: no id / created_* carried over.
      expect(dayInsert).not.toHaveProperty("id");
      expect(dayInsert).not.toHaveProperty("created_at");
    });

    it("copies every meal and every item (foods and recipes) under the NEW day, leaving the source alone", async () => {
      const { db, inserts, updates, deletes } = fakeSupabase({ sourceDay, childCount: 2 });
      await new DietPlansService(db).duplicateDay("day-1", "ع", "Copy");

      const meals = inserts.filter((i) => i.table === "meals").map((i) => i.payload);
      expect(meals).toEqual([
        expect.objectContaining({
          label_en: "Breakfast",
          time_of_day: "08:00",
          diet_plan_id: "plan-1",
          diet_plan_day_id: "new-diet_plan_days",
          client_id: "client-9",
          coach_id: "coach-1",
        }),
        expect.objectContaining({ label_en: "Lunch", diet_plan_day_id: "new-diet_plan_days" }),
      ]);

      const items = inserts.filter((i) => i.table === "meal_items").map((i) => i.payload);
      expect(items).toEqual([
        [
          expect.objectContaining({ meal_id: "new-meals", food_id: "food-1", recipe_id: null, quantity: 2 }),
          expect.objectContaining({ meal_id: "new-meals", food_id: null, recipe_id: "recipe-1", quantity: 1.5 }),
        ],
        [expect.objectContaining({ meal_id: "new-meals-2", food_id: "food-2", quantity: 3, unit: "100g" })],
      ]);

      expect(updates).toHaveLength(0);
      expect(deletes).toHaveLength(0);
    });

    it("does not copy the weekly schedule", async () => {
      const { db, inserts } = fakeSupabase({ sourceDay, childCount: 2 });
      await new DietPlansService(db).duplicateDay("day-1", "ع", "Copy");
      expect(inserts.some((i) => i.table === "diet_plan_schedule")).toBe(false);
    });

    it("returns null and inserts nothing when the day isn't visible", async () => {
      const { db, inserts } = fakeSupabase({ sourceDay: null });
      expect(await new DietPlansService(db).duplicateDay("day-1", "ع", "Copy")).toBeNull();
      expect(inserts).toHaveLength(0);
    });
  });

  describe("removeDay", () => {
    it("refuses to delete the plan's last day", async () => {
      const { db, deletes } = fakeSupabase({ dayRow: { diet_plan_id: "plan-1" }, childCount: 1 });
      expect(await new DietPlansService(db).removeDay("day-1")).toBe("last_day");
      expect(deletes).toHaveLength(0);
    });

    it("deletes a day when the plan has others", async () => {
      const { db, deletes } = fakeSupabase({ dayRow: { diet_plan_id: "plan-1" }, childCount: 2 });
      expect(await new DietPlansService(db).removeDay("day-1")).toBe("deleted");
      expect(deletes).toEqual([{ table: "diet_plan_days", eqs: [["id", "day-1"]] }]);
    });

    it("reports not_found for a day RLS hides", async () => {
      const { db, deletes } = fakeSupabase({ dayRow: null });
      expect(await new DietPlansService(db).removeDay("day-1")).toBe("not_found");
      expect(deletes).toHaveLength(0);
    });
  });
});
