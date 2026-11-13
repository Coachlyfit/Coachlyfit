import { describe, expect, it } from "vitest";
import { projectSetsForWeek, type BaseSet } from "./progression";
import { isDeloadWeek, mesocyclePlan, parseWeekPlan, weekLabel } from "./week-plan";

const base = (over: Partial<BaseSet> = {}): BaseSet[] => [
  { set_index: 1, reps: 8, reps_max: 10, weight: 100, rest_seconds: 90, duration_seconds: null, ...over },
];

describe("parseWeekPlan", () => {
  it("keeps weeks 2..12 with in-range fields and drops everything else", () => {
    expect(
      parseWeekPlan({
        "1": { label: "base" },
        "3": { label: "  Peak  ", load_pct: 105, reps_delta: -1 },
        "4": { deload: true, load_pct: 20 }, // 20% is out of range -> dropped, deload kept
        "13": { label: "x" },
        x: { label: "y" },
        "5": "nope",
      })
    ).toEqual({ "3": { label: "Peak", load_pct: 105, reps_delta: -1 }, "4": { deload: true } });
  });

  it("is null for nothing usable", () => {
    expect(parseWeekPlan(null)).toBeNull();
    expect(parseWeekPlan([])).toBeNull();
    expect(parseWeekPlan({ "2": {} })).toBeNull();
  });
});

describe("isDeloadWeek", () => {
  it("defaults to every 4th week without a plan, never week 1", () => {
    expect([1, 2, 3, 4, 5, 8].map((w) => isDeloadWeek(null, w))).toEqual([false, false, false, true, false, true]);
  });
  it("follows the authored plan once there is one", () => {
    const plan = { "3": { deload: true } };
    expect([3, 4, 8].map((w) => isDeloadWeek(plan, w))).toEqual([true, false, false]);
  });
});

describe("projectSetsForWeek with a week plan", () => {
  it("keeps the legacy behaviour with no plan (week 4 resets, week 5 progresses from 4 steps)", () => {
    expect(projectSetsForWeek(base(), "plus_5kg_week", 4)[0].weight).toBe(100);
    expect(projectSetsForWeek(base(), "plus_5kg_week", 5)[0].weight).toBe(120);
  });

  it("scales load and shifts reps for an authored week, on top of progression", () => {
    const plan = { "3": { load_pct: 105, reps_delta: 1 } };
    const [w3] = projectSetsForWeek(base(), "plus_5kg_week", 3, plan); // 100 + 2*5 = 110 -> 115.5 -> 115.5
    expect(w3.weight).toBe(115.5);
    expect(w3).toMatchObject({ reps: 9, reps_max: 11 });
  });

  it("a flagged deload resets to the base first, then applies its load %", () => {
    const plan = { "3": { deload: true, load_pct: 60 } };
    expect(projectSetsForWeek(base(), "plus_5kg_week", 3, plan)[0].weight).toBe(60);
    // ...and week 4 is no longer a deload because the plan did not flag it
    expect(projectSetsForWeek(base(), "plus_5kg_week", 4, plan)[0].weight).toBe(115);
  });

  it("leaves bodyweight and assisted sets unscaled, and never takes reps below 1", () => {
    const plan = { "2": { load_pct: 50, reps_delta: -10 } };
    expect(projectSetsForWeek(base({ weight: null }), "none", 2, plan)[0].weight).toBeNull();
    expect(projectSetsForWeek(base({ weight: -20 }), "none", 2, plan)[0].weight).toBe(-20);
    expect(projectSetsForWeek(base({ reps: 3, reps_max: null }), "none", 2, plan)[0].reps).toBe(1);
  });

  it("never touches week 1", () => {
    expect(projectSetsForWeek(base(), "none", 1, { "1": { load_pct: 50 } } as never)[0].weight).toBe(100);
  });
});

describe("mesocyclePlan", () => {
  it("builds three plain build weeks then a 60% deload, across weeks 2..12, with no stored label", () => {
    const plan = mesocyclePlan();
    expect(plan["2"]).toEqual({ reps_delta: 0 });
    expect(plan["4"]).toEqual({ load_pct: 60, deload: true });
    expect(Object.keys(plan)).toHaveLength(11);
    expect(isDeloadWeek(plan, 8)).toBe(true);
    expect(isDeloadWeek(plan, 5)).toBe(false);
    // survives the defensive parse (reps_delta 0 keeps the build weeks as entries)
    expect(parseWeekPlan(plan)).toEqual(plan);
  });
});

describe("bilingual week labels", () => {
  it("shows each viewer their own language, falling back to the other language, then the legacy label", () => {
    expect(weekLabel({ label_en: "Peak", label_ar: "ذروة" }, "ar")).toBe("ذروة");
    expect(weekLabel({ label_en: "Peak", label_ar: "ذروة" }, "en")).toBe("Peak");
    expect(weekLabel({ label_en: "Peak" }, "ar")).toBe("Peak");
    expect(weekLabel({ label: "Old" }, "ar")).toBe("Old");
    expect(weekLabel({ label: "Old", label_en: "New" }, "en")).toBe("New");
    expect(weekLabel({ load_pct: 90 }, "en")).toBeNull();
    expect(weekLabel(null, "en")).toBeNull();
  });

  it("parseWeekPlan keeps per-language and legacy labels, trimmed and capped", () => {
    expect(parseWeekPlan({ "2": { label_ar: "  بناء ", label_en: "Build", label: "x".repeat(60) } })).toEqual({
      "2": { label_ar: "بناء", label_en: "Build", label: "x".repeat(40) },
    });
  });

  it("a labelled mesocycle names build and deload weeks in both languages", () => {
    const plan = mesocyclePlan({ build: { en: "Build", ar: "بناء" }, deload: { en: "Deload", ar: "تخفيف" } });
    expect(plan["2"]).toEqual({ label_ar: "بناء", label_en: "Build", reps_delta: 0 });
    expect(plan["4"]).toEqual({ label_ar: "تخفيف", label_en: "Deload", load_pct: 60, deload: true });
    expect(parseWeekPlan(plan)).toEqual(plan);
  });
});
