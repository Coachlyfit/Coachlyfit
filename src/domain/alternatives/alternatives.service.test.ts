import { describe, expect, it } from "vitest";
import {
  AlternativesService,
  MAX_ALTERNATIVES,
  resolveAlternatives,
  type AlternativeExercise,
  type AlternativeRow,
} from "./alternatives.service";

function ex(id: string, archived_at: string | null = null): AlternativeExercise {
  return { id, name_ar: id, name_en: id, archived_at } as AlternativeExercise;
}

function row(
  exercise_id: string,
  alt: AlternativeExercise,
  sort_order: number,
  extra: Partial<AlternativeRow> = {}
): AlternativeRow {
  return { exercise_id, program_item_id: null, coach_id: "coach-1", sort_order, alternative: alt, ...extra };
}

const ids = (list: AlternativeExercise[]) => list.map((e) => e.id);

describe("resolveAlternatives", () => {
  const items = [
    { id: "item-1", exercise_id: "squat" },
    { id: "item-2", exercise_id: "squat" },
  ];

  it("inherits the library list, ordered by sort_order", () => {
    const library = [row("squat", ex("b"), 1), row("squat", ex("a"), 0)];
    expect(ids(resolveAlternatives(items, [], library)["item-1"])).toEqual(["a", "b"]);
  });

  it("an item's override replaces the library list for that item only", () => {
    const library = [row("squat", ex("a"), 0)];
    const override = [row("squat", ex("z"), 0, { program_item_id: "item-1" })];
    const out = resolveAlternatives(items, override, library);
    expect(ids(out["item-1"])).toEqual(["z"]);
    expect(ids(out["item-2"])).toEqual(["a"]);
  });

  it("the coach's own rows beat platform rows; platform is the fallback", () => {
    const platform = row("squat", ex("p"), 0, { coach_id: null });
    expect(ids(resolveAlternatives(items, [], [platform, row("squat", ex("a"), 0)])["item-1"])).toEqual(["a"]);
    expect(ids(resolveAlternatives(items, [], [platform])["item-1"])).toEqual(["p"]);
  });

  it("drops archived exercises and rows whose exercise is hidden by RLS", () => {
    const library = [
      row("squat", ex("old", "2026-01-01"), 0),
      row("squat", ex("ok"), 1),
      { ...row("squat", ex("x"), 2), alternative: null },
    ];
    expect(ids(resolveAlternatives(items, [], library)["item-1"])).toEqual(["ok"]);
  });

  it("gives an empty list when nothing is defined", () => {
    expect(resolveAlternatives(items, [], [])).toEqual({ "item-1": [], "item-2": [] });
  });
});

function fakeSupabase(existing: unknown[]) {
  const inserts: unknown[] = [];
  const deletedIds: string[][] = [];
  const updates: { payload: unknown; id: string }[] = [];
  const read = {
    eq: () => read,
    is: () => read,
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: existing, error: null }),
  };
  const db = {
    from: () => ({
      select: () => read,
      insert: async (rows: unknown) => {
        inserts.push(rows);
        return { error: null };
      },
      delete: () => ({
        in: async (_col: string, rowIds: string[]) => {
          deletedIds.push(rowIds);
          return { error: null };
        },
      }),
      update: (payload: unknown) => ({
        eq: async (_col: string, id: string) => {
          updates.push({ payload, id });
          return { error: null };
        },
      }),
    }),
  };
  return { db: db as never, inserts, deletedIds, updates };
}

describe("AlternativesService.setLibrary", () => {
  const existing = [
    { id: "r-a", alternative_exercise_id: "a", sort_order: 0 },
    { id: "r-b", alternative_exercise_id: "b", sort_order: 1 },
  ];

  it("diffs: adds new, removes dropped, renumbers kept", async () => {
    const f = fakeSupabase(existing);
    await new AlternativesService(f.db).setLibrary("coach-1", "squat", ["b", "c"]);

    expect(f.inserts).toEqual([
      [{ exercise_id: "squat", alternative_exercise_id: "c", coach_id: "coach-1", program_item_id: null, sort_order: 1 }],
    ]);
    expect(f.deletedIds).toEqual([["r-a"]]);
    expect(f.updates).toEqual([{ payload: { sort_order: 0 }, id: "r-b" }]);
  });

  it("does nothing when the list is unchanged", async () => {
    const f = fakeSupabase(existing);
    await new AlternativesService(f.db).setLibrary("coach-1", "squat", ["a", "b"]);
    expect(f.inserts).toEqual([]);
    expect(f.deletedIds).toEqual([]);
    expect(f.updates).toEqual([]);
  });

  it("ignores duplicates and the exercise itself, and caps the list", async () => {
    const f = fakeSupabase([]);
    const many = Array.from({ length: MAX_ALTERNATIVES + 5 }, (_, i) => `alt-${i}`);
    await new AlternativesService(f.db).setLibrary("coach-1", "squat", ["squat", "alt-0", "alt-0", ...many]);
    const inserted = f.inserts[0] as { alternative_exercise_id: string }[];
    expect(inserted).toHaveLength(MAX_ALTERNATIVES);
    expect(new Set(inserted.map((r) => r.alternative_exercise_id)).size).toBe(MAX_ALTERNATIVES);
    expect(inserted.some((r) => r.alternative_exercise_id === "squat")).toBe(false);
  });

  it("an item override writes rows scoped to the program item", async () => {
    const f = fakeSupabase([]);
    await new AlternativesService(f.db).setItemOverride("coach-1", "item-1", "squat", ["a"]);
    expect(f.inserts[0]).toEqual([
      { exercise_id: "squat", alternative_exercise_id: "a", coach_id: "coach-1", program_item_id: "item-1", sort_order: 0 },
    ]);
  });
});
