import { describe, expect, it } from "vitest";
import { ProgramsService } from "./programs.service";

/** Same hand-rolled thenable-chain fake as library.service.test.ts — no
 * mocking library. `parentRow` seeds what a parent-lookup select() resolves
 * to (or null, simulating RLS hiding it). */
function fakeSupabase(opts: {
  parentRow?: Record<string, unknown> | null;
  treeRow?: Record<string, unknown> | null;
  affected?: unknown[];
} = {}) {
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
          // getTree: select("*, program_days(...)").eq(...).order().order().maybeSingle()
          return {
            eq: () => ({
              order: () => ({
                order: () => ({ maybeSingle: async () => ({ data: treeRow, error: null }) }),
              }),
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

describe("ProgramsService", () => {
  describe("child tenant derivation (security)", () => {
    it("addDay takes coach_id/client_id from the parent program row, not from any argument", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: { coach_id: "coach-1", client_id: "client-9" } });
      await new ProgramsService(db).addDay("program-1", { day_index: 1, label_ar: "يوم" });

      expect(inserts[0].table).toBe("program_days");
      expect(inserts[0].payload).toMatchObject({
        coach_id: "coach-1",
        client_id: "client-9",
        program_id: "program-1",
      });
    });

    it("addItem takes coach_id/client_id from the parent program_days row", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: { coach_id: "coach-1", client_id: "client-9" } });
      await new ProgramsService(db).addItem("day-1", { exercise_id: "ex-1" });

      expect(inserts[0].table).toBe("program_items");
      expect(inserts[0].payload).toMatchObject({
        coach_id: "coach-1",
        client_id: "client-9",
        program_day_id: "day-1",
      });
    });

    it("addDay returns null and inserts nothing when the parent program isn't visible", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: null });
      const result = await new ProgramsService(db).addDay("program-1", { day_index: 1 });

      expect(result).toBeNull();
      expect(inserts).toHaveLength(0);
    });

    it("addItem returns null and inserts nothing when the parent day isn't visible", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: null });
      const result = await new ProgramsService(db).addItem("day-1", { exercise_id: "ex-1" });

      expect(result).toBeNull();
      expect(inserts).toHaveLength(0);
    });
  });

  describe("write results", () => {
    it("update/remove/updateDay/removeItem report false on a 0-row RLS no-op", async () => {
      const { db } = fakeSupabase({ affected: [] });
      const svc = new ProgramsService(db);
      expect(await svc.update("p1", { name_ar: "x" })).toBe(false);
      expect(await svc.remove("p1")).toBe(false);
      expect(await svc.updateDay("d1", { day_index: 2 })).toBe(false);
      expect(await svc.removeItem("i1")).toBe(false);
    });

    it("reports true when a row was actually affected", async () => {
      const { db } = fakeSupabase({ affected: [{ id: "p1" }] });
      expect(await new ProgramsService(db).remove("p1")).toBe(true);
    });
  });

  describe("reorderItems", () => {
    it("writes order_index = array position and scopes each update by the parent day id", async () => {
      const { db, updates } = fakeSupabase();
      const count = await new ProgramsService(db).reorderItems("day-1", ["i-c", "i-a", "i-b"]);

      expect(count).toBe(3);
      expect(updates).toHaveLength(3);
      updates.forEach((u, i) => {
        expect(u.table).toBe("program_items");
        expect(u.payload).toEqual({ order_index: i });
        expect(u.eqs).toEqual([
          ["id", ["i-c", "i-a", "i-b"][i]],
          ["program_day_id", "day-1"],
        ]);
      });
    });
  });

  describe("cloneToClient", () => {
    it("stamps the new client_id on program, days, and items", async () => {
      const tree = {
        id: "template-1",
        coach_id: "coach-1",
        client_id: null,
        name_ar: "برنامج",
        name_en: "Program",
        start_date: "2026-08-01",
        end_date: null,
        program_days: [
          {
            id: "day-1",
            day_index: 1,
            order_index: 0,
            label_ar: null,
            label_en: null,
            program_items: [
              {
                id: "item-1",
                exercise_id: "ex-1",
                sets: 3,
                reps: "8-12",
                rest_seconds: 60,
                notes_ar: null,
                notes_en: null,
                order_index: 0,
              },
            ],
          },
        ],
      };
      const { db, inserts } = fakeSupabase({ treeRow: tree });
      const result = await new ProgramsService(db).cloneToClient("template-1", "client-9");

      expect(result).not.toBeNull();
      const programInsert = inserts.find((i) => i.table === "programs");
      const dayInsert = inserts.find((i) => i.table === "program_days");
      const itemInsert = inserts.find((i) => i.table === "program_items");

      expect(programInsert?.payload).toMatchObject({ client_id: "client-9", coach_id: "coach-1" });
      expect(dayInsert?.payload).toMatchObject({ client_id: "client-9", coach_id: "coach-1" });
      expect(itemInsert?.payload).toEqual([
        expect.objectContaining({ client_id: "client-9", coach_id: "coach-1", exercise_id: "ex-1" }),
      ]);
    });

    it("returns null without inserting when the template tree isn't visible", async () => {
      const { db, inserts } = fakeSupabase({ treeRow: null });
      const result = await new ProgramsService(db).cloneToClient("template-1", "client-9");

      expect(result).toBeNull();
      expect(inserts).toHaveLength(0);
    });
  });

  describe("getActiveTreeForClient", () => {
    it("scopes by client_id and takes the most recently created program", async () => {
      const eqCalls: [string, unknown][] = [];
      const tree = { id: "program-1", client_id: "client-9" };
      const db = {
        from: () => ({
          select: () => ({
            eq: (col: string, val: unknown) => {
              eqCalls.push([col, val]);
              return {
                order: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => ({ maybeSingle: async () => ({ data: tree, error: null }) }),
                    }),
                  }),
                }),
              };
            },
          }),
        }),
      };

      const result = await new ProgramsService(db as never).getActiveTreeForClient("client-9");

      expect(result).toEqual(tree);
      expect(eqCalls).toEqual([["client_id", "client-9"]]);
    });
  });
});
