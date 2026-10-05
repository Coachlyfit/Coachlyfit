import { describe, expect, it } from "vitest";
import { LibraryService } from "./library.service";

function fakeSupabase(rows: unknown[], affected: unknown[] = [{ id: "1" }], total = rows.length) {
  const filters: string[] = [];
  // Source-filter calls, recorded as "is:coach_id=null" / "not:coach_id is null"
  // / "is:my_clone_id=null" so a test can assert which predicate the service
  // chose.
  const sourceFilters: string[] = [];
  const groupFilters: string[] = [];
  const ranges: [number, number][] = [];
  // Which table/view each .from() call targeted — searchExercises/searchFoods
  // read exercises_visible/foods_visible (20260805000001), writes stay on
  // the base table.
  const fromCalls: string[] = [];

  // The search chain is select(_, {count}).returns().order().order() then
  // optionally .is()/.not()/.eq()/.or(), ending in .range() — the one link
  // that actually resolves, matching how supabase-js only executes on the
  // terminal call. .returns() is a type-only cast at runtime — it just
  // returns the same chain unchanged.
  function query() {
    const chain = {
      // Lets a chain that ends in .eq()/.returns() (no .range()) resolve
      // directly — getExercise/getFood do this, unlike the paged searches
      // below which always terminate in .range(). Same pattern as
      // review.service.test.ts's fakeDb.
      then: (resolve: (v: { data: unknown[]; count: number; error: null }) => void) =>
        resolve({ data: rows, count: total, error: null }),
      returns: () => chain,
      order: () => chain,
      or: (filter: string) => {
        filters.push(filter);
        return chain;
      },
      is: (column: "coach_id" | "my_clone_id" | "archived_at", value: null) => {
        // archived_at is the list-query's own soft-delete filter, not a
        // source filter — only coach_id/my_clone_id calls (applySource)
        // are what these tests assert on.
        if (column !== "archived_at") sourceFilters.push(`is:${column}=${value}`);
        return chain;
      },
      not: (column: "coach_id", op: string, value: null) => {
        sourceFilters.push(`not:${column} ${op} ${value}`);
        return chain;
      },
      eq: (column: string, value: string) => {
        groupFilters.push(`eq:${column}=${value}`);
        return chain;
      },
      // Real .range() returns a builder that's both directly awaitable AND
      // has one more .returns<T>() to chain — the service always calls the
      // latter (it's the type-cast that has to be the true last call in a
      // real supabase-js chain), so this needs to support both shapes.
      range: (from: number, to: number) => {
        ranges.push([from, to]);
        const result = { data: rows, count: total, error: null };
        return {
          returns: () => Promise.resolve(result),
          then: (resolve: (v: typeof result) => void) => resolve(result),
        };
      },
    };
    return chain;
  }

  const inserts: { table: string; payload: unknown }[] = [];
  const updates: { table: string; payload: unknown }[] = [];
  const deletes: { table: string }[] = [];
  // Writes now end in .select("id") so the service can tell an RLS no-op
  // (0 rows) from a real change.
  const affectedRows = async () => ({ data: affected, error: null });

  const db = {
    from(table: string) {
      fromCalls.push(table);
      return {
        select: () => query(),
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          return { select: () => ({ single: async () => ({ data: { id: "new-1", ...(payload as object) }, error: null }) }) };
        },
        update: (payload: unknown) => {
          updates.push({ table, payload });
          return { eq: () => ({ select: affectedRows }) };
        },
        delete: () => {
          deletes.push({ table });
          return { eq: () => ({ select: affectedRows }) };
        },
      };
    },
  };

  return { db: db as never, filters, sourceFilters, groupFilters, ranges, fromCalls, inserts, updates, deletes };
}

describe("LibraryService", () => {
  it("searches exercises across both name columns", async () => {
    const { db, filters } = fakeSupabase([{ id: "1", name_en: "Squat" }]);
    const result = await new LibraryService(db).searchExercises({ query: "squat" });

    expect(result.rows).toHaveLength(1);
    expect(filters[0]).toBe("name_ar.ilike.%squat%,name_en.ilike.%squat%");
  });

  it("strips PostgREST filter-syntax characters out of the search term itself", async () => {
    const { db, filters } = fakeSupabase([]);
    await new LibraryService(db).searchExercises({ query: "3,5(kg)%test" });

    // The wrapper legitimately adds its own "," (or-separator) and "%"
    // (ilike wildcards) — what must NOT happen is the user's own
    // comma/parens/percent surviving inside the interpolated term.
    expect(filters[0]).toBe(
      "name_ar.ilike.%3 5 kg  test%,name_en.ilike.%3 5 kg  test%"
    );
  });

  it("skips the or() filter entirely for an empty search", async () => {
    const { db, filters } = fakeSupabase([{ id: "1" }]);
    await new LibraryService(db).searchExercises({ query: "   " });
    expect(filters).toHaveLength(0);
  });

  it("createExercise inserts with the caller's coach_id", async () => {
    const { db, inserts } = fakeSupabase([]);
    await new LibraryService(db).createExercise("coach-1", {
      name_ar: "قرفصاء",
      name_en: "Squat",
    });

    expect(inserts[0].table).toBe("exercises");
    expect(inserts[0].payload).toMatchObject({ coach_id: "coach-1", name_en: "Squat" });
  });

  it("createFood inserts with the caller's coach_id and macros", async () => {
    const { db, inserts } = fakeSupabase([]);
    await new LibraryService(db).createFood("coach-1", {
      name_ar: "أرز",
      name_en: "Rice",
      serving_label: "1 cup",
      kcal: 200,
      protein_g: 4,
      carb_g: 45,
      fat_g: 0.5,
      category: "carbs",
    });

    expect(inserts[0].table).toBe("foods");
    expect(inserts[0].payload).toMatchObject({ coach_id: "coach-1", kcal: 200, category: "carbs" });
  });

  it("createExercise forwards source_exercise_id — the clone flow's provenance", async () => {
    const { db, inserts } = fakeSupabase([]);
    await new LibraryService(db).createExercise("coach-1", {
      name_ar: "قرفصاء",
      name_en: "Squat",
      source_exercise_id: "global-1",
    });

    expect(inserts[0].payload).toMatchObject({ coach_id: "coach-1", source_exercise_id: "global-1" });
  });

  it("createFood forwards source_food_id the same way", async () => {
    const { db, inserts } = fakeSupabase([]);
    await new LibraryService(db).createFood("coach-1", {
      name_ar: "أرز",
      name_en: "Rice",
      serving_label: "1 cup",
      kcal: 200,
      protein_g: 4,
      carb_g: 45,
      fat_g: 0.5,
      category: "carbs",
      source_food_id: "global-food-1",
    });

    expect(inserts[0].payload).toMatchObject({ coach_id: "coach-1", source_food_id: "global-food-1" });
  });

  it("updateExercise strips source_exercise_id — provenance isn't user-editable after creation", async () => {
    const { db, updates } = fakeSupabase([]);
    await new LibraryService(db).updateExercise("ex-1", {
      name_ar: "قرفصاء",
      name_en: "Squat",
      source_exercise_id: "attacker-supplied",
    });

    expect(updates[0].payload).not.toHaveProperty("source_exercise_id");
    expect(updates[0].payload).toMatchObject({ name_en: "Squat" });
  });

  it("updateFood strips source_food_id the same way", async () => {
    const { db, updates } = fakeSupabase([]);
    await new LibraryService(db).updateFood("food-1", {
      name_ar: "أرز",
      name_en: "Rice",
      serving_label: "1 cup",
      kcal: 200,
      protein_g: 4,
      carb_g: 45,
      fat_g: 0.5,
      category: "carbs",
      source_food_id: "attacker-supplied",
    });

    expect(updates[0].payload).not.toHaveProperty("source_food_id");
  });

  it("updateExerciseGroup moves an exercise to a new muscle-group column", async () => {
    const { db, updates } = fakeSupabase([]);
    await new LibraryService(db).updateExerciseGroup("ex-1", "back");

    expect(updates[0]).toEqual({ table: "exercises", payload: { muscle_group: "back" } });
  });

  it("updateFoodCategory moves a food to a new kanban column", async () => {
    const { db, updates } = fakeSupabase([]);
    await new LibraryService(db).updateFoodCategory("food-1", "protein");

    expect(updates[0]).toEqual({ table: "foods", payload: { category: "protein" } });
  });

  it("reads from the exercises_visible/foods_visible views, not the base tables", async () => {
    const { db: dbEx, fromCalls: fromEx } = fakeSupabase([]);
    await new LibraryService(dbEx).searchExercises();
    expect(fromEx).toEqual(["exercises_visible"]);

    const { db: dbFood, fromCalls: fromFood } = fakeSupabase([]);
    await new LibraryService(dbFood).searchFoods();
    expect(fromFood).toEqual(["foods_visible"]);
  });

  describe("getExercise / getFood", () => {
    it("reads a single row by id from the view, for \"Edit my version\"", async () => {
      const { db, fromCalls } = fakeSupabase([{ id: "ex-1", name_en: "Squat" }]);
      const result = await new LibraryService(db).getExercise("ex-1");
      expect(fromCalls).toEqual(["exercises_visible"]);
      expect(result).toEqual({ id: "ex-1", name_en: "Squat" });
    });

    it("returns null when nothing matches", async () => {
      const { db } = fakeSupabase([]);
      expect(await new LibraryService(db).getExercise("missing")).toBeNull();
      expect(await new LibraryService(db).getFood("missing")).toBeNull();
    });
  });

  describe("source filter", () => {
    it("'all' hides a global the caller has already cloned, via my_clone_id", async () => {
      const { db, sourceFilters } = fakeSupabase([]);
      await new LibraryService(db).searchExercises({ source: "all" });
      expect(sourceFilters).toEqual(["is:my_clone_id=null"]);
    });

    it("'global' narrows to the platform-curated rows and sends no my_clone_id predicate", async () => {
      const { db, sourceFilters } = fakeSupabase([]);
      await new LibraryService(db).searchExercises({ source: "global" });
      expect(sourceFilters).toEqual(["is:coach_id=null"]);
    });

    it("'mine' narrows by coach_id IS NOT NULL and never by a caller-supplied id", async () => {
      const { db, sourceFilters } = fakeSupabase([]);
      await new LibraryService(db).searchExercises({ source: "mine" });
      // No `coach_id = <id>` clause: read_own_and_global already makes a
      // visible non-global row mean "mine", so the client never gets to
      // assert whose rows these are.
      expect(sourceFilters).toEqual(["not:coach_id is null"]);
    });

    it("composes the source filter with the search term", async () => {
      const { db, sourceFilters, filters } = fakeSupabase([]);
      await new LibraryService(db).searchExercises({ query: "press", source: "mine" });
      expect(sourceFilters).toEqual(["not:coach_id is null"]);
      expect(filters[0]).toBe("name_ar.ilike.%press%,name_en.ilike.%press%");
    });

    it("applies to foods identically", async () => {
      const { db, sourceFilters } = fakeSupabase([]);
      await new LibraryService(db).searchFoods({ source: "global" });
      expect(sourceFilters).toEqual(["is:coach_id=null"]);
    });
  });

  describe("group filter", () => {
    it("narrows exercises by muscle_group", async () => {
      const { db, groupFilters } = fakeSupabase([]);
      await new LibraryService(db).searchExercises({ group: "legs" });
      expect(groupFilters).toEqual(["eq:muscle_group=legs"]);
    });

    it("narrows foods by category", async () => {
      const { db, groupFilters } = fakeSupabase([]);
      await new LibraryService(db).searchFoods({ group: "protein" });
      expect(groupFilters).toEqual(["eq:category=protein"]);
    });

    it("is skipped entirely when null", async () => {
      const { db, groupFilters } = fakeSupabase([]);
      await new LibraryService(db).searchExercises({ group: null });
      expect(groupFilters).toHaveLength(0);
    });

    it("narrows exercises by equipment alongside the group", async () => {
      const { db, groupFilters } = fakeSupabase([]);
      await new LibraryService(db).searchExercises({ group: "legs", equipment: "barbell" });
      expect(groupFilters).toEqual(["eq:muscle_group=legs", "eq:equipment=barbell"]);
    });
  });

  describe("facets", () => {
    function fakeRpc(rows: { grp: string | null; n: number }[]) {
      const calls: { fn: string; args: unknown }[] = [];
      const db = {
        rpc: async (fn: string, args: unknown) => {
          calls.push({ fn, args });
          return { data: rows, error: null };
        },
      };
      return { db: db as never, calls };
    }

    it("sums every row into total but keys only the rows that have a group", async () => {
      const { db } = fakeRpc([
        { grp: "legs", n: 10 },
        { grp: "back", n: 5 },
        { grp: null, n: 2 },
      ]);
      expect(await new LibraryService(db).exerciseFacets()).toEqual({
        total: 17,
        groups: { legs: 10, back: 5 },
      });
    });

    it("sends the sanitized search term, source and equipment — never a group", async () => {
      const { db, calls } = fakeRpc([]);
      await new LibraryService(db).exerciseFacets({ query: " 3,5(kg) ", source: "mine", equipment: "cable" });
      expect(calls).toEqual([
        { fn: "library_exercise_facets", args: { p_query: "3 5 kg", p_source: "mine", p_equipment: "cable" } },
      ]);
    });

    it("counts foods by category through its own function", async () => {
      const { db, calls } = fakeRpc([{ grp: "protein", n: 3 }]);
      expect(await new LibraryService(db).foodFacets({ source: "global" })).toEqual({
        total: 3,
        groups: { protein: 3 },
      });
      expect(calls[0]).toEqual({ fn: "library_food_facets", args: { p_query: "", p_source: "global" } });
    });
  });

  describe("pagination", () => {
    it("ranges by (page - 1) * pageSize, and reports total from the count", async () => {
      const { db, ranges } = fakeSupabase([{ id: "1" }, { id: "2" }], undefined, 47);
      const result = await new LibraryService(db).searchExercises({ page: 3, pageSize: 10 });

      expect(ranges).toEqual([[20, 29]]);
      expect(result).toMatchObject({ total: 47, page: 3, pageSize: 10 });
    });

    it("defaults to page 1 at the default page size", async () => {
      const { db, ranges } = fakeSupabase([]);
      const result = await new LibraryService(db).searchExercises({});
      expect(ranges).toEqual([[0, 23]]);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(24);
    });

    it("clamps pageSize into [1, 100] instead of trusting the caller", async () => {
      const { db: dbHigh, ranges: rangesHigh } = fakeSupabase([]);
      await new LibraryService(dbHigh).searchExercises({ page: 1, pageSize: 500 });
      expect(rangesHigh).toEqual([[0, 99]]);

      const { db: dbLow, ranges: rangesLow } = fakeSupabase([]);
      await new LibraryService(dbLow).searchExercises({ page: 1, pageSize: 0 });
      expect(rangesLow).toEqual([[0, 0]]);
    });

    it("retries once at page 1 when the offset is past the last row (PGRST103)", async () => {
      const calls: [number, number][] = [];
      const db = {
        from: () => ({
          select: () => {
            const chain = {
              order: () => chain,
              // applySource's default ("all") now always calls .is() —
              // see the source-filter tests above.
              is: () => chain,
              // See fakeSupabase's range() above for why this returns a
              // returns()-able thenable instead of a bare Promise.
              range: (from: number, to: number) => {
                calls.push([from, to]);
                const result =
                  from > 0
                    ? { data: null, count: null, error: { code: "PGRST103" } }
                    : { data: [{ id: "1" }], count: 1, error: null };
                return {
                  returns: () => Promise.resolve(result),
                  then: (resolve: (v: typeof result) => void) => resolve(result),
                };
              },
            };
            return chain;
          },
        }),
      };

      const result = await new LibraryService(db as never).searchExercises({ page: 9, pageSize: 10 });

      expect(calls).toEqual([
        [80, 89],
        [0, 9],
      ]);
      expect(result).toMatchObject({ rows: [{ id: "1" }], total: 1, page: 1 });
    });
  });

  describe("write results", () => {
    it("reports false when RLS matches no row, so the caller can't report a phantom success", async () => {
      const { db } = fakeSupabase([], []);
      expect(await new LibraryService(db).deleteExercise("not-mine")).toBe(false);
      expect(await new LibraryService(db).updateExerciseGroup("not-mine", "back")).toBe(false);
    });

    it("reports true when a row was actually affected", async () => {
      const { db } = fakeSupabase([], [{ id: "ex-1" }]);
      expect(await new LibraryService(db).deleteExercise("ex-1")).toBe(true);
    });
  });
});
