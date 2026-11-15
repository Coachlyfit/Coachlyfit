import { describe, expect, it } from "vitest";
import { facets, filterTemplates, NO_FILTERS, summarizeSets, type LibraryRow } from "./library-view";

const row = (o: Partial<LibraryRow>): LibraryRow => ({
  id: "x",
  name_ar: "",
  name_en: "",
  description_ar: null,
  description_en: null,
  level: null,
  goal: null,
  categories: [],
  equipment: [],
  exercises: 5,
  days_per_week: null,
  copyId: null,
  ...o,
});

const rows = [
  row({ id: "a", name_en: "Beginner Chest Day", name_ar: "يوم الصدر للمبتدئين", level: "beginner", categories: ["chest", "strength"], equipment: ["barbell", "cable"] }),
  row({ id: "b", name_en: "Home Back Toning", name_ar: "شد الظهر في المنزل", description_en: "Bodyweight routine", level: "beginner", categories: ["back", "at_home"], equipment: ["body weight"] }),
  row({ id: "c", name_en: "Advanced Back Day", name_ar: "يوم الظهر للمتقدمين", level: "advanced", categories: ["back"], equipment: ["barbell"] }),
];
const ids = (r: LibraryRow[]) => r.map((x) => x.id);

describe("filterTemplates", () => {
  it("returns everything with no filters", () => {
    expect(ids(filterTemplates(rows, NO_FILTERS))).toEqual(["a", "b", "c"]);
  });
  it("searches Arabic and English whichever the page language", () => {
    expect(ids(filterTemplates(rows, { ...NO_FILTERS, q: "ظهر" }))).toEqual(["b", "c"]);
    expect(ids(filterTemplates(rows, { ...NO_FILTERS, q: "CHEST" }))).toEqual(["a"]);
    expect(ids(filterTemplates(rows, { ...NO_FILTERS, q: "bodyweight" }))).toEqual(["b"]);
  });
  it("ANDs category, level and equipment with the search", () => {
    expect(ids(filterTemplates(rows, { ...NO_FILTERS, category: "back" }))).toEqual(["b", "c"]);
    expect(ids(filterTemplates(rows, { ...NO_FILTERS, category: "back", level: "advanced" }))).toEqual(["c"]);
    expect(ids(filterTemplates(rows, { ...NO_FILTERS, equipment: "barbell", q: "day" }))).toEqual(["a", "c"]);
    expect(filterTemplates(rows, { ...NO_FILTERS, category: "legs" })).toEqual([]);
  });
});

describe("facets", () => {
  it("lists only values present, in a stable order", () => {
    expect(facets(rows)).toEqual({
      categories: ["strength", "at_home", "chest", "back"],
      levels: ["beginner", "advanced"],
      equipment: ["barbell", "body weight", "cable"],
    });
  });
});

describe("summarizeSets", () => {
  const f = { num: (n: number) => String(n), seconds: (n: number) => `${n}s`, minutes: (n: number) => `${n}min` };
  const s = (reps: number | null, reps_max: number | null = null, duration_seconds: number | null = null) => ({ reps, reps_max, duration_seconds });

  it("collapses identical sets to 'n × target'", () => {
    expect(summarizeSets([s(12), s(12), s(12)], f)).toBe("3 × 12");
    expect(summarizeSets([s(10, 12), s(10, 12)], f)).toBe("2 × 10–12");
    expect(summarizeSets([s(null, null, 30), s(null, null, 30)], f)).toBe("2 × 30s");
  });
  it("lists a pyramid set by set", () => {
    expect(summarizeSets([s(12), s(10), s(8), s(6)], f)).toBe("12 · 10 · 8 · 6");
  });
  it("shows whole minutes of 2+ as minutes, and is empty for no targets", () => {
    expect(summarizeSets([s(null, null, 480)], f)).toBe("1 × 8min");
    expect(summarizeSets([s(null, null, 90)], f)).toBe("1 × 90s");
    expect(summarizeSets([s(null)], f)).toBe("");
  });
});
