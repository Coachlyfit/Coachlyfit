import { describe, expect, it } from "vitest";
import { LibraryService } from "./library.service";

function fakeSupabase(rows: unknown[], affected: unknown[] = [{ id: "1" }]) {
  const filters: string[] = [];
  // Source-filter calls, recorded as "is:coach_id=null" / "not:coach_id is null"
  // so a test can assert which predicate the service chose.
  const sourceFilters: string[] = [];

  // The search chain is select().order().limit() then optionally .is()/.not()
  // /.or(), any of which can be the last link — so every link is both
  // thenable and chainable.
  function query() {
    const chain = Promise.resolve({ data: rows, error: null }) as Promise<{
      data: unknown[];
      error: null;
    }> & {
      or: (filter: string) => typeof chain;
      is: (column: string, value: null) => typeof chain;
      not: (column: string, op: string, value: null) => typeof chain;
      limit: (count: number) => typeof chain;
    };

    chain.or = (filter) => {
      filters.push(filter);
      return chain;
    };
    chain.is = (column, value) => {
      sourceFilters.push(`is:${column}=${value}`);
      return chain;
    };
    chain.not = (column, op, value) => {
      sourceFilters.push(`not:${column} ${op} ${value}`);
      return chain;
    };
    chain.limit = () => chain;

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
      return {
        select: () => ({ order: () => query() }),
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

  return { db: db as never, filters, sourceFilters, inserts, updates, deletes };
}

describe("LibraryService", () => {
  it("searches exercises across both name columns", async () => {
    const { db, filters } = fakeSupabase([{ id: "1", name_en: "Squat" }]);
    const result = await new LibraryService(db).searchExercises("squat");

    expect(result).toHaveLength(1);
    expect(filters[0]).toBe("name_ar.ilike.%squat%,name_en.ilike.%squat%");
  });

  it("strips PostgREST filter-syntax characters out of the search term itself", async () => {
    const { db, filters } = fakeSupabase([]);
    await new LibraryService(db).searchExercises("3,5(kg)%test");

    // The wrapper legitimately adds its own "," (or-separator) and "%"
    // (ilike wildcards) — what must NOT happen is the user's own
    // comma/parens/percent surviving inside the interpolated term.
    expect(filters[0]).toBe(
      "name_ar.ilike.%3 5 kg  test%,name_en.ilike.%3 5 kg  test%"
    );
  });

  it("skips the or() filter entirely for an empty search", async () => {
    const { db, filters } = fakeSupabase([{ id: "1" }]);
    await new LibraryService(db).searchExercises("   ");
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

  describe("source filter", () => {
    it("adds no predicate for 'all' — RLS already scopes to global + own", async () => {
      const { db, sourceFilters } = fakeSupabase([]);
      await new LibraryService(db).searchExercises("", "all");
      expect(sourceFilters).toHaveLength(0);
    });

    it("'global' narrows to the platform-curated rows", async () => {
      const { db, sourceFilters } = fakeSupabase([]);
      await new LibraryService(db).searchExercises("", "global");
      expect(sourceFilters).toEqual(["is:coach_id=null"]);
    });

    it("'mine' narrows by coach_id IS NOT NULL and never by a caller-supplied id", async () => {
      const { db, sourceFilters } = fakeSupabase([]);
      await new LibraryService(db).searchExercises("", "mine");
      // No `coach_id = <id>` clause: read_own_and_global already makes a
      // visible non-global row mean "mine", so the client never gets to
      // assert whose rows these are.
      expect(sourceFilters).toEqual(["not:coach_id is null"]);
    });

    it("composes the source filter with the search term", async () => {
      const { db, sourceFilters, filters } = fakeSupabase([]);
      await new LibraryService(db).searchExercises("press", "mine");
      expect(sourceFilters).toEqual(["not:coach_id is null"]);
      expect(filters[0]).toBe("name_ar.ilike.%press%,name_en.ilike.%press%");
    });

    it("applies to foods identically", async () => {
      const { db, sourceFilters } = fakeSupabase([]);
      await new LibraryService(db).searchFoods("", "global");
      expect(sourceFilters).toEqual(["is:coach_id=null"]);
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
