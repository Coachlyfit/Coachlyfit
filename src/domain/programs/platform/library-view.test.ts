import { describe, expect, it } from "vitest";
import { facets, filterTemplates, NO_FILTERS, parseLibraryFilters, pruneFilters, sortTemplates, summarizeSets, writeLibraryFilters, type LibraryRow } from "./library-view";

const row = (o: Partial<LibraryRow>): LibraryRow => ({
  id: "x",
  kind: "workout",
  duration_weeks: null,
  gender_target: null,
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
  created_at: "2026-01-01T00:00:00Z",
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
    expect(ids(filterTemplates(rows, { ...NO_FILTERS, category: ["back"] }))).toEqual(["b", "c"]);
    expect(ids(filterTemplates(rows, { ...NO_FILTERS, category: ["back"], level: ["advanced"] }))).toEqual(["c"]);
    expect(ids(filterTemplates(rows, { ...NO_FILTERS, equipment: ["barbell"], q: "day" }))).toEqual(["a", "c"]);
    expect(filterTemplates(rows, { ...NO_FILTERS, category: ["legs"] })).toEqual([]);
  });
});

describe("facets", () => {
  it("lists only values present, in a stable order", () => {
    expect(facets(rows)).toMatchObject({
      categories: ["strength", "at_home", "chest", "back"],
      levels: ["beginner", "advanced"],
      equipment: ["barbell", "body weight", "cable"],
    });
  });
});

describe("summarizeSets", () => {
  const f = { num: (n: number) => String(n), seconds: (n: number) => `${n}s`, minutes: (n: number) => `${n}min`, max: () => "Max" };
  const s = (reps: number | null, reps_max: number | null = null, duration_seconds: number | null = null) => ({ reps, reps_max, duration_seconds });

  it("collapses identical sets to 'n × target'", () => {
    expect(summarizeSets([s(12), s(12), s(12)], f)).toBe("3 × 12");
    expect(summarizeSets([s(10, 12), s(10, 12)], f)).toBe("2 × 10–12");
    expect(summarizeSets([s(null, null, 30), s(null, null, 30)], f)).toBe("2 × 30s");
  });
  it("shows an AMRAP set with no other target as 'Max'", () => {
    const amrap = { reps: null, reps_max: null, duration_seconds: null, set_type: "amrap" };
    expect(summarizeSets([amrap, amrap, amrap], f)).toBe("3 × Max");
    // an AMRAP set that does carry a rep target keeps it
    expect(summarizeSets([{ ...amrap, reps: 8 }], f)).toBe("1 × 8");
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

describe("plan filters", () => {
  const plans = [
    row({ id: "p1", kind: "plan", name_en: "Beginner Push-Pull-Legs", name_ar: "الدفع والسحب للمبتدئين", goal: "muscle", gender_target: "all", duration_weeks: 4, level: "beginner" }),
    row({ id: "p2", kind: "plan", name_en: "Women's Body Toning", name_ar: "شدّ الجسم للنساء", goal: "muscle", gender_target: "female", duration_weeks: 6 }),
    row({ id: "p3", kind: "plan", name_en: "Powerlifting Cycle", name_ar: "رفع القوة", goal: "strength", gender_target: "male", duration_weeks: 8, level: "advanced" }),
    row({ id: "p4", kind: "plan", name_en: "Tabata Week", name_ar: "أسبوع التاباتا", goal: "fat_loss", gender_target: "all", duration_weeks: 1 }),
  ];
  it("filters by goal and duration", () => {
    expect(ids(filterTemplates(plans, { ...NO_FILTERS, goal: ["muscle"] }))).toEqual(["p1", "p2"]);
    expect(ids(filterTemplates(plans, { ...NO_FILTERS, duration: [8] }))).toEqual(["p3"]);
    expect(ids(filterTemplates(plans, { ...NO_FILTERS, goal: ["muscle"], duration: [6] }))).toEqual(["p2"]);
  });
  it("a plan for everyone shows under either gender, a gendered plan only under its own", () => {
    expect(ids(filterTemplates(plans, { ...NO_FILTERS, gender: ["female"] }))).toEqual(["p1", "p2", "p4"]);
    expect(ids(filterTemplates(plans, { ...NO_FILTERS, gender: ["male"] }))).toEqual(["p1", "p3", "p4"]);
  });
  it("searches plan names in Arabic and English", () => {
    expect(ids(filterTemplates(plans, { ...NO_FILTERS, q: "للنساء" }))).toEqual(["p2"]);
    expect(ids(filterTemplates(plans, { ...NO_FILTERS, q: "tabata" }))).toEqual(["p4"]);
  });
  it("facets list only durations/goals/genders present, in order", () => {
    expect(facets(plans)).toMatchObject({
      goals: ["muscle", "fat_loss", "strength"],
      durations: [1, 4, 6, 8],
      genders: ["female", "male"],
      levels: ["beginner", "advanced"],
    });
    expect(facets([plans[1]]).genders).toEqual(["female"]);
    expect(facets([plans[3]]).genders).toEqual(["female", "male"]); // "all" offers both
  });
});

describe("multi-select", () => {
  it("ORs values inside a group, ANDs across groups", () => {
    expect(ids(filterTemplates(rows, { ...NO_FILTERS, level: ["beginner", "advanced"] }))).toEqual(["a", "b", "c"]);
    expect(ids(filterTemplates(rows, { ...NO_FILTERS, category: ["chest", "back"], level: ["beginner"] }))).toEqual(["a", "b"]);
    expect(ids(filterTemplates(rows, { ...NO_FILTERS, equipment: ["cable", "body weight"] }))).toEqual(["a", "b"]);
  });
  it("gender: picking both shows female, male and 'all' plans, never unset ones", () => {
    const plans = [
      row({ id: "f", kind: "plan", gender_target: "female" }),
      row({ id: "m", kind: "plan", gender_target: "male" }),
      row({ id: "x", kind: "plan", gender_target: null }),
    ];
    expect(ids(filterTemplates(plans, { ...NO_FILTERS, gender: ["female", "male"] }))).toEqual(["f", "m"]);
  });
});

describe("sortTemplates", () => {
  const s = [
    row({ id: "1", name_en: "B", name_ar: "ب", created_at: "2026-03-01T00:00:00Z" }),
    row({ id: "2", name_en: "A", name_ar: "أ", created_at: "2026-01-01T00:00:00Z" }),
  ];
  it("sorts by locale name or newest first", () => {
    expect(ids(sortTemplates(s, "name", "en"))).toEqual(["2", "1"]);
    expect(ids(sortTemplates(s, "name", "ar"))).toEqual(["2", "1"]);
    expect(ids(sortTemplates(s, "newest", "en"))).toEqual(["1", "2"]);
  });
});

describe("url round-trip", () => {
  it("keeps each tab's filters separate and omits defaults", () => {
    const f = { ...NO_FILTERS, q: " chest ", level: ["beginner", "advanced"], category: ["back"] };
    const sp = new URLSearchParams(writeLibraryFilters(new URLSearchParams("kind=plan&p_goal=muscle"), "workout", f, "newest"));
    expect(sp.get("kind")).toBe("plan");
    expect(sp.get("p_goal")).toBe("muscle");
    expect(sp.get("level")).toBe("beginner,advanced");
    expect(parseLibraryFilters(sp, "workout")).toEqual({ filters: { ...f, q: "chest" }, sort: "newest" });
    expect(parseLibraryFilters(sp, "plan").filters.goal).toEqual(["muscle"]);
    expect(parseLibraryFilters(sp, "plan").filters.level).toEqual([]);
    expect(writeLibraryFilters(sp, "workout", NO_FILTERS, "name")).toBe("kind=plan&p_goal=muscle");
  });
  it("parses durations as positive integers only and prunes values the data doesn't offer", () => {
    const { filters } = parseLibraryFilters(new URLSearchParams("p_duration=4,x,-1,6&p_level=nope,beginner"), "plan");
    expect(filters.duration).toEqual([4, 6]);
    expect(pruneFilters(filters, facets(rows)).level).toEqual(["beginner"]);
  });
});
