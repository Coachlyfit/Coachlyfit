import { describe, expect, it } from "vitest";
import { ProgramsService, CLIENT_SAFE_ITEM_COLUMNS, planGroupOrder } from "./programs.service";

/** Same hand-rolled thenable-chain fake as library.service.test.ts — no
 * mocking library. `parentRow` seeds what a parent-lookup select() resolves
 * to (or null, simulating RLS hiding it). */
function fakeSupabase(opts: {
  parentRow?: Record<string, unknown> | null;
  treeRow?: Record<string, unknown> | null;
  affected?: unknown[];
  itemsRow?: unknown[];
  ownClientRow?: Record<string, unknown> | null;
  /** groupItems' lookups: the selected rows, and the whole day in order. */
  pickedRows?: unknown[];
  dayRows?: unknown[];
  /** addItem's "last order_index of the day" lookup. */
  lastOrderRows?: unknown[];
  /** updateFromTemplate's lookup of the client's existing program. */
  oldProgramRow?: Record<string, unknown> | null;
  /** addSession's lookup of the day the session hangs off. */
  sessionParentRow?: Record<string, unknown> | null;
} = {}) {
  const {
    parentRow = null,
    treeRow = null,
    affected = [{ id: "1" }],
    itemsRow = [],
    ownClientRow = { id: "client-1" },
    pickedRows = [
      { id: "a", program_day_id: "day-1", group_key: null },
      { id: "b", program_day_id: "day-1", group_key: null },
    ],
    dayRows = [
      { id: "a", group_key: null, order_index: 0 },
      { id: "b", group_key: null, order_index: 1 },
    ],
    lastOrderRows = [],
    oldProgramRow = null,
    sessionParentRow = null,
  } = opts;

  const inserts: { table: string; payload: unknown }[] = [];
  const upserts: { table: string; payload: unknown }[] = [];
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const updates: { table: string; payload: unknown; eqs: [string, unknown][]; ins: [string, unknown[]][] }[] = [];
  const deletes: { table: string; eqs: [string, unknown][] }[] = [];
  const affectedRows = async () => ({ data: affected, error: null });

  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return { data: true, error: null };
    },
    from(table: string) {
      return {
        upsert: async (payload: unknown) => {
          upserts.push({ table, payload });
          return { error: null };
        },
        select: (cols?: string) => {
          // Parent-derivation lookups: select("coach_id, client_id").eq(...).maybeSingle()
          if (cols === "coach_id, client_id") {
            return { eq: () => ({ maybeSingle: async () => ({ data: parentRow, error: null }) }) };
          }
          // reorderItems' pre-check: select("id, group_key").eq(...).in(...)
          if (cols === "id, group_key") {
            return { eq: () => ({ in: async () => ({ data: itemsRow, error: null }) }) };
          }
          // groupItems: the selected rows, then the whole day in order.
          if (cols === "id, program_day_id, group_key") {
            return { in: async () => ({ data: pickedRows, error: null }) };
          }
          if (cols === "id, group_key, order_index") {
            return { eq: () => ({ order: () => ({ order: async () => ({ data: dayRows, error: null }) }) }) };
          }
          // addSession: the day the new session belongs to.
          if (cols === "coach_id, client_id, program_id, day_index, parent_day_id") {
            return { eq: () => ({ maybeSingle: async () => ({ data: sessionParentRow, error: null }) }) };
          }
          // updateFromTemplate: the client's program being replaced.
          if (cols === "id, client_id, start_date, end_date, source_template_id") {
            return { eq: () => ({ maybeSingle: async () => ({ data: oldProgramRow, error: null }) }) };
          }
          // addItem: the day's current last order_index.
          if (cols === "order_index") {
            return { eq: () => ({ order: () => ({ limit: async () => ({ data: lastOrderRows, error: null }) }) }) };
          }
          // assertOwnClient: select("id").eq(...).maybeSingle()
          if (cols === "id" && table === "clients") {
            return { eq: () => ({ maybeSingle: async () => ({ data: ownClientRow, error: null }) }) };
          }
          // getTree: select("*, program_days(...)").eq(...).order() x4.maybeSingle()
          // getActiveTreeForClient additionally chains .is("archived_at", null),
          // a 5th .order(), and .limit(1) before the same maybeSingle tail.
          const terminal = () => ({
            maybeSingle: async () => ({ data: treeRow, error: null }),
            limit: () => ({ maybeSingle: async () => ({ data: treeRow, error: null }) }),
          });
          const step4 = () => ({ order: () => terminal(), ...terminal() });
          const step3 = () => ({ order: () => step4() });
          const step2 = () => ({ order: () => step3() });
          // getTree's path (eq -> 4 orders) starts here. getActiveTreeForClient's
          // path (eq -> is -> 5 orders: created_at first, then the same 4) needs
          // one extra order level before landing on the same step2 chain.
          const step1 = () => ({ order: () => step2() });
          return {
            eq: () => ({
              ...step1(),
              is: () => ({ order: () => step1() }),
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
            neq: (col: string, val: unknown) => {
              eqs.push([col, val]);
              return chain;
            },
            is: (col: string, val: unknown) => {
              eqs.push([col, val]);
              return chain;
            },
            not: (col: string, _op: string, val: unknown) => {
              eqs.push([col, val]);
              return chain;
            },
            in: (col: string, vals: unknown[]) => {
              ins.push([col, vals]);
              return chain;
            },
            select: affectedRows,
            // cloneToClient's replaceActive branch awaits the chain
            // directly with no .select() tail — make the chain thenable so
            // that resolves too, same as the real PostgrestFilterBuilder.
            then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
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

  return { db: db as never, inserts, upserts, rpcs, updates, deletes };
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
        "group_config",
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

    it("updateItem replaces the sets through one atomic RPC (with the legacy snapshot), never delete-then-insert", async () => {
      const { db, deletes, inserts, rpcs } = fakeSupabase({
        affected: [{ id: "item-1", coach_id: "coach-1", client_id: "client-9" }],
      });
      const ok = await new ProgramsService(db).updateItem("item-1", { sets: [{ reps: 5, weight: 60, set_type: "backoff" }] });

      expect(ok).toBe(true);
      expect(rpcs).toHaveLength(1);
      expect(rpcs[0].fn).toBe("replace_program_item_sets");
      expect(rpcs[0].args).toMatchObject({
        p_item_id: "item-1",
        p_sets: [expect.objectContaining({ reps: 5, weight: 60, set_type: "backoff" })],
        p_legacy: { sets: 1, reps: "5" },
      });
      // The non-atomic path is gone: no separate delete of the sets, no re-insert.
      expect(deletes.find((d) => d.table === "program_item_sets")).toBeUndefined();
      expect(inserts.find((i) => i.table === "program_item_sets")).toBeUndefined();
    });

    it("updateItem reports false (and writes nothing more) when the RPC finds no visible item", async () => {
      const { db, rpcs } = fakeSupabase();
      (db as unknown as { rpc: unknown }).rpc = async () => ({ data: false, error: null });
      expect(await new ProgramsService(db).updateItem("item-1", { sets: [{ reps: 5 }] })).toBe(false);
      expect(rpcs).toHaveLength(0);
    });

    it("updateItem stores the coach-only note in program_item_notes, and clears it when blank", async () => {
      const set = fakeSupabase({ affected: [{ id: "item-1", coach_id: "coach-1", client_id: "c" }] });
      await new ProgramsService(set.db).updateItem("item-1", { notes_ar: "x", coach_note_private: " watch her knee " });
      expect(set.upserts.find((u) => u.table === "program_item_notes")?.payload).toMatchObject({
        program_item_id: "item-1",
        coach_id: "coach-1",
        note: "watch her knee",
      });
      // The note never goes onto program_items any more.
      expect(JSON.stringify(set.updates.find((u) => u.table === "program_items")?.payload)).not.toContain("coach_note_private");

      const clear = fakeSupabase({ affected: [{ id: "item-1", coach_id: "coach-1", client_id: "c" }] });
      await new ProgramsService(clear.db).updateItem("item-1", { notes_ar: "x", coach_note_private: "" });
      expect(clear.deletes).toContainEqual({ table: "program_item_notes", eqs: [["program_item_id", "item-1"]] });
      expect(clear.upserts.find((u) => u.table === "program_item_notes")).toBeUndefined();
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

  describe("renameProgram", () => {
    it("writes only the two names, scoped to the program id", async () => {
      const { db, updates } = fakeSupabase();
      const renamed = await new ProgramsService(db).renameProgram("p1", { name_ar: "برنامج", name_en: "Program" });

      expect(renamed).toBe(true);
      expect(updates).toHaveLength(1);
      expect(updates[0].table).toBe("programs");
      expect(updates[0].payload).toEqual({ name_ar: "برنامج", name_en: "Program" });
      expect(updates[0].eqs).toEqual([["id", "p1"]]);
    });

    it("reports false when RLS hides the program (not this coach's row)", async () => {
      const { db } = fakeSupabase({ affected: [] });
      expect(await new ProgramsService(db).renameProgram("p1", { name_ar: "x", name_en: "x" })).toBe(false);
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

  describe("reorderSections", () => {
    it("persists the normalized section order on the day row", async () => {
      const { db, updates } = fakeSupabase();
      const count = await new ProgramsService(db).reorderSections("day-1", ["mobility_rehab", "workout"]);

      expect(count).toBe(1);
      expect(updates).toHaveLength(1);
      expect(updates[0].table).toBe("program_days");
      expect(updates[0].payload).toEqual({
        section_order: ["mobility_rehab", "workout", "activities"],
      });
      expect(updates[0].eqs).toEqual([["id", "day-1"]]);
    });

    it("reports 0 when RLS hides the day (not this coach's program)", async () => {
      const { db } = fakeSupabase({ affected: [] });
      expect(await new ProgramsService(db).reorderSections("day-1", ["workout"])).toBe(0);
    });
  });

  describe("groupItems / ungroupItems", () => {
    it("groupItems stamps a shared group_key and the given kind on every item id, returning the affected count", async () => {
      const { db, updates } = fakeSupabase({ affected: [{ id: "a" }, { id: "b" }] });
      const count = await new ProgramsService(db).groupItems(["a", "b"], "superset");

      expect(count).toBe(2);
      // Already adjacent and tie-free: no order rewrites, just the group stamp.
      expect(updates).toHaveLength(1);
      expect(updates[0].table).toBe("program_items");
      expect(updates[0].payload).toMatchObject({ group_kind: "superset" });
      expect(typeof (updates[0].payload as { group_key: string }).group_key).toBe("string");
      expect(updates[0].ins).toEqual([["id", ["a", "b"]]]);
    });

    it("groupItems gathers non-adjacent items and rewrites the day's order before stamping the group", async () => {
      const { db, updates } = fakeSupabase({
        affected: [{ id: "a" }, { id: "c" }],
        pickedRows: [
          { id: "a", program_day_id: "day-1", group_key: null },
          { id: "c", program_day_id: "day-1", group_key: null },
        ],
        dayRows: [
          { id: "a", group_key: null, order_index: 0 },
          { id: "b", group_key: null, order_index: 1 },
          { id: "c", group_key: null, order_index: 2 },
        ],
      });
      await new ProgramsService(db).groupItems(["a", "c"], "superset");
      // order becomes a, c, b -> only c (2 -> 1) and b (1 -> 2) change
      const orderWrites = updates.filter((u) => "order_index" in (u.payload as object));
      expect(orderWrites.map((u) => [u.eqs[0][1], (u.payload as { order_index: number }).order_index])).toEqual([
        ["c", 1],
        ["b", 2],
      ]);
      expect(updates[updates.length - 1].payload).toMatchObject({ group_kind: "superset" });
    });

    it("groupItems rejects a selection that spans days or does not match what was found", async () => {
      const { db, updates } = fakeSupabase({
        pickedRows: [
          { id: "a", program_day_id: "day-1", group_key: null },
          { id: "b", program_day_id: "day-2", group_key: null },
        ],
      });
      await expect(new ProgramsService(db).groupItems(["a", "b"], "superset")).rejects.toThrow("group_selection_invalid");
      expect(updates).toHaveLength(0);
      const missing = fakeSupabase({ pickedRows: [{ id: "a", program_day_id: "day-1", group_key: null }] });
      await expect(new ProgramsService(missing.db).groupItems(["a", "b"], "superset")).rejects.toThrow("group_selection_invalid");
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
      expect(updates[0].payload).toEqual({ group_key: null, group_kind: null, group_config: null });
      expect(updates[0].ins).toEqual([["id", ["a", "b"]]]);
    });

    it("groupItems stores a timed format's config alongside the kind", async () => {
      const { db, updates } = fakeSupabase({ affected: [{ id: "a" }, { id: "b" }] });
      await new ProgramsService(db).groupItems(["a", "b"], "amrap", { time_cap_s: 720 });
      expect(updates[0].payload).toMatchObject({ group_kind: "amrap", group_config: { time_cap_s: 720 } });
    });

    it("setGroupFormat rewrites kind + config on every member without touching group_key", async () => {
      const { db, updates } = fakeSupabase({ affected: [{ id: "a" }, { id: "b" }] });
      const count = await new ProgramsService(db).setGroupFormat(["a", "b"], "emom", { interval_s: 60, rounds: 8 });
      expect(count).toBe(2);
      expect(updates[0].payload).toEqual({ group_kind: "emom", group_config: { interval_s: 60, rounds: 8 } });
      expect(updates[0].ins).toEqual([["id", ["a", "b"]]]);
    });
  });

  describe("cloneToClient / saveAsTemplate", () => {
    const tree = {
      id: "template-1",
      coach_id: "coach-1",
      client_id: null,
      name_ar: "برنامج",
      name_en: "Program",
      start_date: "2026-08-01",
      end_date: null,
      schedule_mode: "weekly",
      program_days: [
        {
          id: "day-1",
          day_index: 1,
          order_index: 0,
          section_order: ["mobility_rehab", "workout", "activities"],
          label_ar: null,
          label_en: null,
          weekday: 3,
          notes_ar: null,
          notes_en: null,
          diet_plan_id: null,
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
              block: "warmup",
              rehab_phase_id: null,
              coach_note_private: "watch the knee",
              group_key: "g1",
              group_kind: "superset",
              program_item_sets: [
                { id: "set-1", set_index: 1, reps: 8, weight: 50, rest_seconds: 60, duration_seconds: null },
                { id: "set-2", set_index: 2, reps: 12, weight: 45, rest_seconds: 60, duration_seconds: null },
              ],
            },
          ],
          program_activities: [],
        },
      ],
      rehab_protocols: [],
      diet_variants: [],
    };

    it("stamps the new client_id + source_template_id, and clones schedule_mode/weekday/block/group/progression/per-set data", async () => {
      const { db, inserts, upserts } = fakeSupabase({ treeRow: tree });
      const result = await new ProgramsService(db).cloneToClient("template-1", "client-9");

      expect(result).not.toBeNull();
      const programInsert = inserts.find((i) => i.table === "programs");
      const dayInsert = inserts.find((i) => i.table === "program_days");
      const itemInsert = inserts.find((i) => i.table === "program_items");
      const setsInsert = inserts.find((i) => i.table === "program_item_sets");

      expect(programInsert?.payload).toMatchObject({
        client_id: "client-9",
        coach_id: "coach-1",
        schedule_mode: "weekly",
        source_template_id: "template-1",
      });
      expect(dayInsert?.payload).toMatchObject({
        client_id: "client-9",
        coach_id: "coach-1",
        weekday: 3,
        section_order: ["mobility_rehab", "workout", "activities"],
      });
      expect(itemInsert?.payload).toMatchObject({
        client_id: "client-9",
        coach_id: "coach-1",
        exercise_id: "ex-1",
        progression_rule: "plus_2_5kg_week",
        block: "warmup",
        group_key: "g1",
        group_kind: "superset",
      });
      expect(JSON.stringify(itemInsert?.payload)).not.toContain("coach_note_private");
      expect(upserts.find((u) => u.table === "program_item_notes")?.payload).toMatchObject({
        program_item_id: "new-program_items",
        coach_id: "coach-1",
        note: "watch the knee",
      });
      expect(setsInsert?.payload).toEqual([
        expect.objectContaining({ client_id: "client-9", coach_id: "coach-1", set_index: 1, reps: 8, weight: 50 }),
        expect.objectContaining({ client_id: "client-9", coach_id: "coach-1", set_index: 2, reps: 12, weight: 45 }),
      ]);
    });

    it("clones distance, calories and extra metrics on each set (a run, an assisted pull-up)", async () => {
      const withRun = structuredClone(tree) as typeof tree;
      withRun.program_days[0].program_items[0].program_item_sets = [
        {
          id: "set-1",
          set_index: 1,
          reps: null,
          weight: null,
          rest_seconds: null,
          duration_seconds: 1800,
          distance_m: 5000,
          calories: 300,
          extra: { incline: 2 },
        },
      ] as never;
      const { db, inserts } = fakeSupabase({ treeRow: withRun });
      await new ProgramsService(db).cloneToClient("template-1", "client-9");

      const setsInsert = inserts.find((i) => i.table === "program_item_sets");
      expect(setsInsert?.payload).toEqual([
        expect.objectContaining({ duration_seconds: 1800, distance_m: 5000, calories: 300, extra: { incline: 2 } }),
      ]);
    });

    it("returns null without inserting when the source tree isn't visible", async () => {
      const { db, inserts } = fakeSupabase({ treeRow: null });
      const result = await new ProgramsService(db).cloneToClient("template-1", "client-9");

      expect(result).toBeNull();
      expect(inserts).toHaveLength(0);
    });

    it("starts the cloned program today, not on the template's own start_date", async () => {
      const { db, inserts } = fakeSupabase({ treeRow: tree });
      await new ProgramsService(db).cloneToClient("template-1", "client-9");

      const programInsert = inserts.find((i) => i.table === "programs");
      const today = new Date().toISOString().slice(0, 10);
      expect((programInsert?.payload as { start_date: string }).start_date).toBe(today);
    });

    it("replaceActive archives the client's other active programs after cloning, leaving the clone alone", async () => {
      const { db, updates } = fakeSupabase({ treeRow: tree });
      const result = await new ProgramsService(db).cloneToClient("template-1", "client-9", true);

      const archiveUpdate = updates.find((u) => u.table === "programs");
      expect(archiveUpdate?.payload).toMatchObject({ archived_at: expect.any(String) });
      expect(archiveUpdate?.eqs).toContainEqual(["client_id", "client-9"]);
      expect(archiveUpdate?.eqs).toContainEqual(["archived_at", null]);
      expect(archiveUpdate?.eqs).toContainEqual(["id", result?.id]);
    });

    it("does not touch other programs when replaceActive is left false", async () => {
      const { db, updates } = fakeSupabase({ treeRow: tree });
      await new ProgramsService(db).cloneToClient("template-1", "client-9");

      expect(updates.find((u) => u.table === "programs")).toBeUndefined();
    });

    it("saveAsTemplate clones an assigned program back to client_id null with no source_template_id and no end_date", async () => {
      const assigned = { ...tree, id: "program-1", client_id: "client-9", end_date: "2026-09-01" };
      const { db, inserts } = fakeSupabase({ treeRow: assigned });
      const result = await new ProgramsService(db).saveAsTemplate("program-1", "قالب جديد", "New template");

      expect(result).not.toBeNull();
      const programInsert = inserts.find((i) => i.table === "programs");
      expect(programInsert?.payload).toMatchObject({
        client_id: null,
        source_template_id: null,
        end_date: null,
        name_ar: "قالب جديد",
        name_en: "New template",
      });
      const dayInsert = inserts.find((i) => i.table === "program_days");
      const itemInsert = inserts.find((i) => i.table === "program_items");
      expect(dayInsert?.payload).toMatchObject({ client_id: null });
      expect(itemInsert?.payload).toMatchObject({ client_id: null });
    });
  });

  describe("snapshotIfAssigned", () => {
    const tree = {
      id: "program-1",
      coach_id: "coach-1",
      client_id: "client-9",
      program_days: [],
    };

    it("inserts a program_revisions row for an assigned program and returns its id", async () => {
      const { db, inserts } = fakeSupabase({ treeRow: tree });
      const result = await new ProgramsService(db).snapshotIfAssigned("program-1", "add_item");

      expect(result).toBe("new-program_revisions");
      const revisionInsert = inserts.find((i) => i.table === "program_revisions");
      expect(revisionInsert?.payload).toMatchObject({
        coach_id: "coach-1",
        program_id: "program-1",
        reason: "add_item",
      });
    });

    it("is a no-op (returns null) for a template (client_id null)", async () => {
      const { db, inserts } = fakeSupabase({ treeRow: { ...tree, client_id: null } });
      const result = await new ProgramsService(db).snapshotIfAssigned("program-1");

      expect(result).toBeNull();
      expect(inserts.find((i) => i.table === "program_revisions")).toBeUndefined();
    });

    it("is a no-op (returns null) when the program isn't visible", async () => {
      const { db, inserts } = fakeSupabase({ treeRow: null });
      const result = await new ProgramsService(db).snapshotIfAssigned("program-1");

      expect(result).toBeNull();
      expect(inserts.find((i) => i.table === "program_revisions")).toBeUndefined();
    });
  });

  describe("restoreRevision", () => {
    const snapshot = {
      coach_id: "coach-1",
      client_id: "client-9",
      program_days: [
        {
          id: "day-1",
          day_index: 1,
          order_index: 0,
          section_order: ["workout"],
          label_ar: null,
          label_en: null,
          weekday: null,
          notes_ar: null,
          notes_en: null,
          diet_plan_id: "diet-gone",
          program_items: [
            {
              id: "item-1",
              exercise_id: "ex-1",
              sets: 1,
              reps: "10",
              rest_seconds: 60,
              progression_rule: "none",
              notes_ar: null,
              notes_en: null,
              order_index: 0,
              block: "main",
              rehab_phase_id: "phase-gone",
              coach_note_private: null,
              tempo: null,
              per_side: false,
              scaled_notes_ar: null,
              scaled_notes_en: null,
              group_key: null,
              group_kind: null,
              group_config: null,
              program_item_sets: [
                { set_index: 1, reps: 10, weight: 40, rest_seconds: 60, duration_seconds: null, set_type: "working" },
              ],
            },
          ],
          program_activities: [{ id: "act-1", kind: "cardio", modality: "running", order_index: 0, log_required: true }],
        },
      ],
    };

    /** Records every write; `live` is what the existence checks find. */
    function restoreDb(live: Record<string, string[]> = {}) {
      const upserts: { table: string; payload: Record<string, unknown>; opts: unknown }[] = [];
      const inserts: { table: string; payload: unknown }[] = [];
      const deletes: { table: string; eqs: [string, unknown][]; notIn: unknown[] }[] = [];
      const db = {
        from: (table: string) => ({
          select: (cols?: string) => {
            if (cols === "program_id, snapshot") {
              return { eq: () => ({ maybeSingle: async () => ({ data: { program_id: "program-1", snapshot }, error: null }) }) };
            }
            // existingIds: select("id").in("id", wanted)
            return { in: async () => ({ data: (live[table] ?? []).map((id) => ({ id })), error: null }) };
          },
          upsert: async (payload: Record<string, unknown>, opts: unknown) => {
            upserts.push({ table, payload, opts });
            return { error: null };
          },
          insert: async (payload: unknown) => {
            inserts.push({ table, payload });
            return { error: null };
          },
          delete: () => {
            const rec = { table, eqs: [] as [string, unknown][], notIn: [] as unknown[] };
            deletes.push(rec);
            const chain: Record<string, unknown> = {
              eq: (col: string, val: unknown) => {
                rec.eqs.push([col, val]);
                return chain;
              },
              not: (_col: string, _op: string, val: unknown) => {
                rec.notIn.push(val);
                return chain;
              },
              then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
            };
            return chain;
          },
        }),
      };
      return { db: db as never, upserts, inserts, deletes };
    }

    it("upserts the snapshot under its original ids instead of deleting the tree (client logs cascade off these ids)", async () => {
      const { db, upserts, inserts, deletes } = restoreDb();
      const ok = await new ProgramsService(db).restoreRevision("revision-1");
      expect(ok).toBe(true);

      expect(upserts.find((u) => u.table === "program_days")).toMatchObject({
        payload: { id: "day-1", program_id: "program-1", coach_id: "coach-1", client_id: "client-9", day_index: 1 },
        opts: { onConflict: "id" },
      });
      expect(upserts.find((u) => u.table === "program_items")?.payload).toMatchObject({ id: "item-1", program_day_id: "day-1", exercise_id: "ex-1" });
      expect(upserts.find((u) => u.table === "program_activities")?.payload).toMatchObject({ id: "act-1", program_day_id: "day-1" });
      expect(inserts.find((i) => i.table === "program_item_sets")?.payload).toEqual([
        expect.objectContaining({ program_item_id: "item-1", set_index: 1, reps: 10, weight: 40 }),
      ]);

      // Nothing is ever deleted wholesale: every day/item/activity delete excludes the snapshot's ids.
      for (const d of deletes.filter((d) => !["program_item_sets", "program_item_notes"].includes(d.table))) {
        expect(d.notIn.length).toBe(1);
      }
      expect(deletes.find((d) => d.table === "program_days")).toMatchObject({ eqs: [["program_id", "program-1"]], notIn: ["(day-1)"] });
      expect(deletes.find((d) => d.table === "program_items")).toMatchObject({ eqs: [["program_day_id", "day-1"]], notIn: ["(item-1)"] });
    });

    it("restores a vanished rehab phase / diet plan reference as null, keeps one that still exists", async () => {
      const gone = restoreDb();
      await new ProgramsService(gone.db).restoreRevision("revision-1");
      expect(gone.upserts.find((u) => u.table === "program_days")?.payload.diet_plan_id).toBeNull();
      expect(gone.upserts.find((u) => u.table === "program_items")?.payload.rehab_phase_id).toBeNull();

      const kept = restoreDb({ diet_plans: ["diet-gone"], rehab_phases: ["phase-gone"] });
      await new ProgramsService(kept.db).restoreRevision("revision-1");
      expect(kept.upserts.find((u) => u.table === "program_days")?.payload.diet_plan_id).toBe("diet-gone");
      expect(kept.upserts.find((u) => u.table === "program_items")?.payload.rehab_phase_id).toBe("phase-gone");
    });

    it("returns false without touching anything when the revision isn't visible", async () => {
      const writes: unknown[] = [];
      const db = {
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          upsert: async (p: unknown) => writes.push(p),
          insert: async (p: unknown) => writes.push(p),
          delete: () => writes.push("delete"),
        }),
      };
      expect(await new ProgramsService(db as never).restoreRevision("revision-1")).toBe(false);
      expect(writes).toHaveLength(0);
    });
  });

  describe("duplicateItem", () => {
    it("copies the source item's prescription and per-set data onto the end of the same day", async () => {
      const source = {
        id: "item-1",
        coach_id: "coach-1",
        client_id: "client-9",
        program_day_id: "day-1",
        exercise_id: "ex-1",
        sets: 2,
        reps: "8-12",
        rest_seconds: 60,
        progression_rule: "none",
        notes_ar: null,
        notes_en: null,
        block: "main",
        private_note: { note: "watch her knees" },
        program_item_sets: [
          { set_index: 1, reps: 8, weight: 50, rest_seconds: 60 },
          { set_index: 2, reps: 12, weight: 45, rest_seconds: 60 },
        ],
      };
      const inserts: { table: string; payload: unknown }[] = [];
      const upserts: { table: string; payload: unknown }[] = [];
      const db = {
        from: (table: string) => ({
          upsert: async (payload: unknown) => {
            upserts.push({ table, payload });
            return { error: null };
          },
          select: (cols?: string) => ({
            eq: () => {
              if (cols === "order_index") {
                return { order: () => ({ limit: async () => ({ data: [{ order_index: 2 }], error: null }) }) };
              }
              return { maybeSingle: async () => ({ data: source, error: null }) };
            },
          }),
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

      const result = await new ProgramsService(db as never).duplicateItem("item-1");
      expect(result).not.toBeNull();

      const itemInsert = inserts.find((i) => i.table === "program_items");
      expect(itemInsert?.payload).toMatchObject({
        exercise_id: "ex-1",
        order_index: 3,
      });
      expect(JSON.stringify(itemInsert?.payload)).not.toContain("coach_note_private");
      expect(upserts.find((u) => u.table === "program_item_notes")?.payload).toMatchObject({
        program_item_id: "new-program_items",
        note: "watch her knees",
      });

      const setsInsert = inserts.find((i) => i.table === "program_item_sets");
      expect(setsInsert?.payload).toEqual([
        expect.objectContaining({ set_index: 1, reps: 8, weight: 50 }),
        expect.objectContaining({ set_index: 2, reps: 12, weight: 45 }),
      ]);
    });

    it("returns null without inserting when the source item isn't visible", async () => {
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
      const result = await new ProgramsService(db as never).duplicateItem("item-1");
      expect(result).toBeNull();
      expect(inserts).toHaveLength(0);
    });
  });

  describe("replaceItemExercise", () => {
    it("updates exercise_id and reports true when a row was affected", async () => {
      const updates: { payload: unknown }[] = [];
      const db = {
        from: () => ({
          update: (payload: unknown) => {
            updates.push({ payload });
            return { eq: () => ({ select: async () => ({ data: [{ id: "item-1" }], error: null }) }) };
          },
        }),
      };
      const ok = await new ProgramsService(db as never).replaceItemExercise("item-1", "ex-2");
      expect(ok).toBe(true);
      expect(updates[0].payload).toEqual({ exercise_id: "ex-2" });
    });

    it("reports false when RLS matches no row", async () => {
      const db = {
        from: () => ({
          update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }),
        }),
      };
      const ok = await new ProgramsService(db as never).replaceItemExercise("item-1", "ex-2");
      expect(ok).toBe(false);
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
                is: () => ({
                  order: () => ({
                    order: () => ({
                      order: () => ({
                        order: () => ({
                          order: () => ({
                            limit: () => ({ maybeSingle: async () => ({ data: tree, error: null }) }),
                          }),
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

      const result = await new ProgramsService(db as never).getActiveTreeForClient("client-9");

      expect(result).toEqual(tree);
      expect(eqCalls).toEqual([["client_id", "client-9"]]);
    });
  });

  describe("listOverview", () => {
    it("is one programs query, with sessions bounded to the requested range", async () => {
      const calls: unknown[][] = [];
      const tables: string[] = [];
      const chain: Record<string, unknown> = {
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [{ id: "p1" }], error: null }),
      };
      for (const method of ["select", "is", "gte", "lt", "order"]) {
        chain[method] = (...args: unknown[]) => {
          calls.push([method, ...args]);
          return chain;
        };
      }
      const db = {
        from: (table: string) => {
          tables.push(table);
          return chain;
        },
      };

      const result = await new ProgramsService(db as never).listOverview("2026-10-03", "2026-10-10");

      expect(result).toEqual([{ id: "p1" }]);
      expect(tables).toEqual(["programs"]);
      expect(calls).toContainEqual(["is", "archived_at", null]);
      expect(calls).toContainEqual(["gte", "program_days.workout_sessions.started_at", "2026-10-03"]);
      expect(calls).toContainEqual(["lt", "program_days.workout_sessions.started_at", "2026-10-10"]);
    });
  });
});

describe("planGroupOrder", () => {
  const day = (...keys: (string | null)[]) => keys.map((group_key, i) => ({ id: String.fromCharCode(97 + i), group_key }));

  it("keeps an already-adjacent selection where it is", () => {
    expect(planGroupOrder(day(null, null, null), ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("gathers a split selection at the first selected position", () => {
    expect(planGroupOrder(day(null, null, null, null), ["a", "c"])).toEqual(["a", "c", "b", "d"]);
    expect(planGroupOrder(day(null, null, null, null), ["d", "b"])).toEqual(["a", "b", "d", "c"]);
  });

  it("allows regrouping a whole existing group but refuses to split one", () => {
    expect(planGroupOrder(day("g", "g", null), ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(planGroupOrder(day("g", "g", null), ["a", "c"])).toBeNull();
  });

  it("is null for an empty match", () => {
    expect(planGroupOrder(day(null), ["zz"])).toBeNull();
  });
});

describe("addItem ordering", () => {
  it("appends after the day's last order_index instead of defaulting every item to 0", async () => {
    const { db, inserts } = fakeSupabase({
      parentRow: { coach_id: "coach-1", client_id: null },
      lastOrderRows: [{ order_index: 4 }],
    });
    await new ProgramsService(db).addItem("day-1", { exercise_id: "ex-1", sets: [{ reps: 8 }] });
    const item = inserts.find((i) => i.table === "program_items")!.payload as { order_index: number };
    expect(item.order_index).toBe(5);
  });

  it("starts an empty day at 0", async () => {
    const { db, inserts } = fakeSupabase({ parentRow: { coach_id: "coach-1", client_id: null } });
    await new ProgramsService(db).addItem("day-1", { exercise_id: "ex-1", sets: [{ reps: 8 }] });
    expect((inserts.find((i) => i.table === "program_items")!.payload as { order_index: number }).order_index).toBe(0);
  });
});

describe("updateFromTemplate", () => {
  const template = {
    id: "template-1",
    coach_id: "coach-1",
    client_id: null,
    name_ar: "قالب",
    name_en: "Template",
    start_date: "2026-01-01",
    end_date: null,
    schedule_mode: "cycle",
    program_days: [],
    rehab_protocols: [],
    diet_variants: [],
  };
  const old = { id: "old-1", client_id: "client-9", start_date: "2026-10-01", end_date: "2026-12-31", source_template_id: "template-1" };

  it("clones the template's current tree onto the client on the SAME dates and archives only the old copy", async () => {
    const { db, inserts, updates } = fakeSupabase({ treeRow: template, oldProgramRow: old });
    const result = await new ProgramsService(db).updateFromTemplate("template-1", "old-1");

    expect(result).not.toBeNull();
    expect(inserts.find((i) => i.table === "programs")?.payload).toMatchObject({
      client_id: "client-9",
      source_template_id: "template-1",
      start_date: "2026-10-01",
      end_date: "2026-12-31",
    });
    const archive = updates.find((u) => u.table === "programs");
    expect(archive?.payload).toHaveProperty("archived_at");
    expect(archive?.eqs).toEqual([["id", "old-1"]]);
  });

  it("refuses a program that is a template, invisible, or came from a different template", async () => {
    for (const row of [null, { ...old, client_id: null }, { ...old, source_template_id: "other" }]) {
      const { db, inserts } = fakeSupabase({ treeRow: template, oldProgramRow: row });
      expect(await new ProgramsService(db).updateFromTemplate("template-1", "old-1")).toBeNull();
      expect(inserts).toHaveLength(0);
    }
  });
});

describe("extra sessions", () => {
  const parent = { coach_id: "coach-1", client_id: "client-9", program_id: "program-1", day_index: 3, parent_day_id: null };

  it("addSession creates a day that points at its parent and shares its day_index, ordered after existing sessions", async () => {
    const { db, inserts } = fakeSupabase({ sessionParentRow: parent, lastOrderRows: [{ order_index: 1 }] });
    const result = await new ProgramsService(db).addSession("day-3", { label_en: "Evening", notes_en: "easy" });

    expect(result).not.toBeNull();
    expect(inserts.find((i) => i.table === "program_days")?.payload).toMatchObject({
      coach_id: "coach-1",
      client_id: "client-9",
      program_id: "program-1",
      parent_day_id: "day-3",
      day_index: 3,
      order_index: 2,
      label_en: "Evening",
    });
  });

  it("addSession returns null for an invisible parent and refuses to nest a session under a session", async () => {
    const none = fakeSupabase({ sessionParentRow: null });
    expect(await new ProgramsService(none.db).addSession("day-x", {})).toBeNull();
    expect(none.inserts).toHaveLength(0);

    const nested = fakeSupabase({ sessionParentRow: { ...parent, parent_day_id: "day-1" } });
    await expect(new ProgramsService(nested.db).addSession("day-3-pm", {})).rejects.toThrow("session_parent_invalid");
    expect(nested.inserts).toHaveLength(0);
  });

  it("clone inserts a session after its parent (even if listed first) and remaps parent_day_id to the new day", async () => {
    const day = (id: string, parent: string | null) => ({
      id,
      day_index: 1,
      order_index: 0,
      section_order: ["workout"],
      label_ar: null,
      label_en: null,
      weekday: null,
      notes_ar: null,
      notes_en: null,
      diet_plan_id: null,
      parent_day_id: parent,
      program_items: [],
      program_activities: [],
    });
    const tree = {
      id: "template-1",
      coach_id: "coach-1",
      client_id: null,
      name_ar: "ق",
      name_en: "T",
      start_date: "2026-01-01",
      end_date: null,
      schedule_mode: "cycle",
      // the session is listed BEFORE its parent on purpose
      program_days: [day("day-1-pm", "day-1"), day("day-1", null)],
      rehab_protocols: [],
      diet_variants: [],
    };
    const { db, inserts } = fakeSupabase({ treeRow: tree });
    await new ProgramsService(db).cloneToClient("template-1", "client-9");

    const dayInserts = inserts.filter((i) => i.table === "program_days").map((i) => i.payload as { parent_day_id: string | null });
    expect(dayInserts).toHaveLength(2);
    expect(dayInserts[0].parent_day_id).toBeNull();
    expect(dayInserts[1].parent_day_id).toBe("new-program_days"); // the parent's NEW id
  });

  it("duplicateDay does not duplicate a session on its own", async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { id: "d-pm", parent_day_id: "d", program_items: [], program_activities: [] }, error: null }) }),
        }),
      }),
    };
    expect(await new ProgramsService(db as never).duplicateDay("d-pm")).toBeNull();
  });
});
