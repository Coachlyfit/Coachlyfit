import { describe, expect, it } from "vitest";
import { ProgramsService, CLIENT_SAFE_ITEM_COLUMNS } from "./programs.service";

/** Same hand-rolled thenable-chain fake as library.service.test.ts — no
 * mocking library. `parentRow` seeds what a parent-lookup select() resolves
 * to (or null, simulating RLS hiding it). */
function fakeSupabase(opts: {
  parentRow?: Record<string, unknown> | null;
  treeRow?: Record<string, unknown> | null;
  affected?: unknown[];
  itemsRow?: unknown[];
} = {}) {
  const { parentRow = null, treeRow = null, affected = [{ id: "1" }], itemsRow = [] } = opts;

  const inserts: { table: string; payload: unknown }[] = [];
  const updates: { table: string; payload: unknown; eqs: [string, unknown][]; ins: [string, unknown[]][] }[] = [];
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
          // reorderItems' pre-check: select("id, group_key").eq(...).in(...)
          if (cols === "id, group_key") {
            return { eq: () => ({ in: async () => ({ data: itemsRow, error: null }) }) };
          }
          // getTree: select("*, program_days(...)").eq(...).order().order().order().maybeSingle()
          return {
            eq: () => ({
              order: () => ({
                order: () => ({
                  order: () => ({ maybeSingle: async () => ({ data: treeRow, error: null }) }),
                }),
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
          const ins: [string, unknown[]][] = [];
          const chain = {
            eq: (col: string, val: unknown) => {
              eqs.push([col, val]);
              return chain;
            },
            in: (col: string, vals: unknown[]) => {
              ins.push([col, vals]);
              return chain;
            },
            select: affectedRows,
          };
          updates.push({ table, payload, eqs, ins });
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

  describe("CLIENT_SAFE_ITEM_COLUMNS (security)", () => {
    // getActiveTreeForClient and the client workout session page both build
    // their program_items select from this constant instead of `*` — this
    // guards the one thing that actually keeps a coach's private
    // prescription note out of a client-facing response, since RLS's
    // client_read_own is a row policy and has no way to hide one column on
    // an otherwise-visible row.
    it("never includes coach_note_private", () => {
      expect(CLIENT_SAFE_ITEM_COLUMNS).not.toMatch(/coach_note_private/);
    });

    it("includes every other current program_items column a client-facing view needs", () => {
      for (const col of [
        "id",
        "coach_id",
        "client_id",
        "program_day_id",
        "exercise_id",
        "sets",
        "reps",
        "rest_seconds",
        "notes_ar",
        "notes_en",
        "order_index",
        "progression_rule",
        "group_key",
        "group_kind",
        "block",
      ]) {
        expect(CLIENT_SAFE_ITEM_COLUMNS).toContain(col);
      }
    });
  });

  describe("per-set prescriptions", () => {
    it("addItem writes a program_item_sets row per set, plus a legacy sets/reps snapshot on program_items", async () => {
      const { db, inserts } = fakeSupabase({ parentRow: { coach_id: "coach-1", client_id: "client-9" } });
      await new ProgramsService(db).addItem("day-1", {
        exercise_id: "ex-1",
        sets: [
          { reps: 8, weight: 50 },
          { reps: 12, weight: 40 },
        ],
        progression_rule: "plus_5kg_week",
      });

      const itemInsert = inserts.find((i) => i.table === "program_items");
      expect(itemInsert?.payload).toMatchObject({ sets: 2, reps: "8-12", progression_rule: "plus_5kg_week" });

      const setsInsert = inserts.find((i) => i.table === "program_item_sets");
      expect(setsInsert?.payload).toEqual([
        expect.objectContaining({ set_index: 1, reps: 8, weight: 50, coach_id: "coach-1", client_id: "client-9" }),
        expect.objectContaining({ set_index: 2, reps: 12, weight: 40, coach_id: "coach-1", client_id: "client-9" }),
      ]);
    });

    it("updateItem replaces program_item_sets (delete-then-reinsert) when sets are provided", async () => {
      const { db, deletes, inserts } = fakeSupabase({
        affected: [{ id: "item-1", coach_id: "coach-1", client_id: "client-9" }],
      });
      const ok = await new ProgramsService(db).updateItem("item-1", { sets: [{ reps: 5, weight: 60 }] });

      expect(ok).toBe(true);
      expect(deletes).toContainEqual({
        table: "program_item_sets",
        eqs: [["program_item_id", "item-1"]],
      });
      const setsInsert = inserts.find((i) => i.table === "program_item_sets");
      expect(setsInsert?.payload).toEqual([
        expect.objectContaining({ set_index: 1, reps: 5, weight: 60, program_item_id: "item-1" }),
      ]);
    });

    it("updateItem leaves program_item_sets untouched when sets aren't provided", async () => {
      const { db, deletes } = fakeSupabase({ affected: [{ id: "item-1", coach_id: "coach-1", client_id: "c" }] });
      await new ProgramsService(db).updateItem("item-1", { notes_ar: "ملاحظة" });
      expect(deletes).toHaveLength(0);
    });
  });

  describe("applyLoadReduction", () => {
    it("scales weight down by percent, rounded to the nearest 0.5kg, and skips bodyweight sets", async () => {
      const updates: { id: string; weight: number }[] = [];
      const db = {
        from: (table: string) => {
          if (table === "program_item_sets") {
            return {
              select: () => ({
                in: async () => ({
                  data: [
                    { id: "set-1", weight: 100 },
                    { id: "set-2", weight: null },
                  ],
                  error: null,
                }),
              }),
              update: (payload: { weight: number }) => ({
                eq: (_col: string, id: string) => {
                  updates.push({ id, weight: payload.weight });
                  return Promise.resolve({ error: null });
                },
              }),
            };
          }
          throw new Error(`unexpected table ${table}`);
        },
      };

      const count = await new ProgramsService(db as never).applyLoadReduction(["item-1"], 10);

      expect(count).toBe(1);
      expect(updates).toEqual([{ id: "set-1", weight: 90 }]);
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

    it("allows a reorder where a group's members stay contiguous", async () => {
      const itemsRow = [
        { id: "a", group_key: "g1" },
        { id: "b", group_key: "g1" },
        { id: "c", group_key: null },
      ];
      const { db, updates } = fakeSupabase({ itemsRow });
      const count = await new ProgramsService(db).reorderItems("day-1", ["c", "a", "b"]);
      expect(count).toBe(3);
      expect(updates).toHaveLength(3);
    });

    it("rejects a reorder that splits a group's members apart", async () => {
      const itemsRow = [
        { id: "a", group_key: "g1" },
        { id: "b", group_key: "g1" },
        { id: "c", group_key: null },
      ];
      const { db } = fakeSupabase({ itemsRow });
      await expect(new ProgramsService(db).reorderItems("day-1", ["a", "c", "b"])).rejects.toThrow(
        "group_not_contiguous"
      );
    });
  });

  describe("groupItems / ungroupItems", () => {
    it("groupItems stamps a shared group_key and the given kind on every item id, returning the affected count", async () => {
      const { db, updates } = fakeSupabase({ affected: [{ id: "a" }, { id: "b" }] });
      const count = await new ProgramsService(db).groupItems(["a", "b"], "superset");

      expect(count).toBe(2);
      expect(updates).toHaveLength(1);
      expect(updates[0].table).toBe("program_items");
      expect(updates[0].payload).toMatchObject({ group_kind: "superset" });
      expect(typeof (updates[0].payload as { group_key: string }).group_key).toBe("string");
      expect(updates[0].ins).toEqual([["id", ["a", "b"]]]);
    });

    it("groupItems is a no-op for fewer than 2 items", async () => {
      const { db, updates } = fakeSupabase();
      const count = await new ProgramsService(db).groupItems(["a"], "superset");
      expect(count).toBe(0);
      expect(updates).toHaveLength(0);
    });

    it("ungroupItems clears group_key and group_kind on the given ids", async () => {
      const { db, updates } = fakeSupabase({ affected: [{ id: "a" }, { id: "b" }] });
      const count = await new ProgramsService(db).ungroupItems(["a", "b"]);

      expect(count).toBe(2);
      expect(updates[0].payload).toEqual({ group_key: null, group_kind: null });
      expect(updates[0].ins).toEqual([["id", ["a", "b"]]]);
    });
  });

  describe("cloneToClient", () => {
    it("stamps the new client_id on program/days/items, and clones progression_rule + per-set data", async () => {
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
                sets: 2,
                reps: "8-12",
                rest_seconds: 60,
                progression_rule: "plus_2_5kg_week",
                notes_ar: null,
                notes_en: null,
                order_index: 0,
                program_item_sets: [
                  { id: "set-1", set_index: 1, reps: 8, weight: 50, rest_seconds: 60 },
                  { id: "set-2", set_index: 2, reps: 12, weight: 45, rest_seconds: 60 },
                ],
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
      const setsInsert = inserts.find((i) => i.table === "program_item_sets");

      expect(programInsert?.payload).toMatchObject({ client_id: "client-9", coach_id: "coach-1" });
      expect(dayInsert?.payload).toMatchObject({ client_id: "client-9", coach_id: "coach-1" });
      expect(itemInsert?.payload).toMatchObject({
        client_id: "client-9",
        coach_id: "coach-1",
        exercise_id: "ex-1",
        progression_rule: "plus_2_5kg_week",
      });
      expect(setsInsert?.payload).toEqual([
        expect.objectContaining({ client_id: "client-9", coach_id: "coach-1", set_index: 1, reps: 8, weight: 50 }),
        expect.objectContaining({ client_id: "client-9", coach_id: "coach-1", set_index: 2, reps: 12, weight: 45 }),
      ]);
    });

    it("returns null without inserting when the template tree isn't visible", async () => {
      const { db, inserts } = fakeSupabase({ treeRow: null });
      const result = await new ProgramsService(db).cloneToClient("template-1", "client-9");

      expect(result).toBeNull();
      expect(inserts).toHaveLength(0);
    });
  });

  describe("snapshotIfAssigned", () => {
    const tree = {
      id: "program-1",
      coach_id: "coach-1",
      client_id: "client-9",
      program_days: [],
    };

    it("inserts a program_revisions row for an assigned program and returns true", async () => {
      const { db, inserts } = fakeSupabase({ treeRow: tree });
      const result = await new ProgramsService(db).snapshotIfAssigned("program-1", "add_item");

      expect(result).toBe(true);
      const revisionInsert = inserts.find((i) => i.table === "program_revisions");
      expect(revisionInsert?.payload).toMatchObject({
        coach_id: "coach-1",
        program_id: "program-1",
        reason: "add_item",
      });
    });

    it("is a no-op (returns false) for a template (client_id null)", async () => {
      const { db, inserts } = fakeSupabase({ treeRow: { ...tree, client_id: null } });
      const result = await new ProgramsService(db).snapshotIfAssigned("program-1");

      expect(result).toBe(false);
      expect(inserts.find((i) => i.table === "program_revisions")).toBeUndefined();
    });

    it("is a no-op (returns false) when the program isn't visible", async () => {
      const { db, inserts } = fakeSupabase({ treeRow: null });
      const result = await new ProgramsService(db).snapshotIfAssigned("program-1");

      expect(result).toBe(false);
      expect(inserts.find((i) => i.table === "program_revisions")).toBeUndefined();
    });
  });

  describe("restoreRevision", () => {
    it("clears the program's current days and re-inserts the snapshotted tree", async () => {
      const snapshot = {
        coach_id: "coach-1",
        client_id: "client-9",
        program_days: [
          {
            day_index: 1,
            order_index: 0,
            label_ar: null,
            label_en: null,
            weekday: null,
            program_items: [
              {
                exercise_id: "ex-1",
                sets: 1,
                reps: "10",
                rest_seconds: 60,
                progression_rule: "none",
                notes_ar: null,
                notes_en: null,
                order_index: 0,
                block: "main",
                coach_note_private: null,
                group_key: null,
                group_kind: null,
                program_item_sets: [{ set_index: 1, reps: 10, weight: 40, rest_seconds: 60 }],
              },
            ],
          },
        ],
      };

      const inserts: { table: string; payload: unknown }[] = [];
      const deletes: { table: string; eqs: [string, unknown][] }[] = [];
      const db = {
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { program_id: "program-1", snapshot },
                error: null,
              }),
            }),
          }),
          delete: () => {
            const eqs: [string, unknown][] = [];
            const chain = {
              eq: (col: string, val: unknown) => {
                eqs.push([col, val]);
                deletes.push({ table, eqs });
                return { error: null };
              },
            };
            return chain;
          },
          insert: (payload: unknown) => {
            inserts.push({ table, payload });
            return {
              select: () => ({
                single: async () => ({ data: { id: `new-${table}`, ...(payload as object) }, error: null }),
              }),
            };
          },
        }),
      };

      const ok = await new ProgramsService(db as never).restoreRevision("revision-1");
      expect(ok).toBe(true);
      expect(deletes).toContainEqual({ table: "program_days", eqs: [["program_id", "program-1"]] });

      const dayInsert = inserts.find((i) => i.table === "program_days");
      expect(dayInsert?.payload).toMatchObject({ coach_id: "coach-1", client_id: "client-9", day_index: 1 });

      const itemInsert = inserts.find((i) => i.table === "program_items");
      expect(itemInsert?.payload).toMatchObject({ exercise_id: "ex-1", block: "main" });

      const setsInsert = inserts.find((i) => i.table === "program_item_sets");
      expect(setsInsert?.payload).toEqual([
        expect.objectContaining({ set_index: 1, reps: 10, weight: 40 }),
      ]);
    });

    it("returns false without touching anything when the revision isn't visible", async () => {
      const inserts: unknown[] = [];
      const db = {
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          insert: (payload: unknown) => {
            inserts.push(payload);
            return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
          },
        }),
      };
      const ok = await new ProgramsService(db as never).restoreRevision("revision-1");
      expect(ok).toBe(false);
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

      const result = await new ProgramsService(db as never).getActiveTreeForClient("client-9");

      expect(result).toEqual(tree);
      expect(eqCalls).toEqual([["client_id", "client-9"]]);
    });
  });
});
