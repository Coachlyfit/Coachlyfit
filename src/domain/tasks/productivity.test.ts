import { describe, expect, it } from "vitest";
import {
  NO_COUNTS,
  completionRate,
  durationParts,
  onTimeRate,
  resolveRange,
  sumCounts,
  type ProductivityCounts,
} from "./productivity";

const TODAY = "2026-10-13";
const counts = (patch: Partial<ProductivityCounts>): ProductivityCounts => ({ ...NO_COUNTS, ...patch });

describe("resolveRange", () => {
  it("a preset is that many days ending today, inclusive", () => {
    expect(resolveRange("7d", TODAY)).toEqual({ range: "7d", from: "2026-10-07", to: TODAY });
    expect(resolveRange("30d", TODAY)).toEqual({ range: "30d", from: "2026-09-14", to: TODAY });
    expect(resolveRange("90d", TODAY)).toEqual({ range: "90d", from: "2026-07-16", to: TODAY });
  });

  it("custom keeps valid dates", () => {
    expect(resolveRange("custom", TODAY, "2026-01-01", "2026-03-31")).toEqual({
      range: "custom",
      from: "2026-01-01",
      to: "2026-03-31",
    });
  });

  it("custom with missing, malformed or reversed dates falls back to 30 days", () => {
    const fallback = { range: "30d", from: "2026-09-14", to: TODAY };
    expect(resolveRange("custom", TODAY)).toEqual(fallback);
    expect(resolveRange("custom", TODAY, "2026-01-01")).toEqual(fallback);
    expect(resolveRange("custom", TODAY, "nope", "2026-03-31")).toEqual(fallback);
    expect(resolveRange("custom", TODAY, "2026-03-31", "2026-01-01")).toEqual(fallback);
  });
});

describe("rates", () => {
  it("are null, not zero, when there is nothing to measure", () => {
    expect(completionRate(NO_COUNTS)).toBeNull();
    expect(onTimeRate(counts({ assigned: 4, completed: 2 }))).toBeNull();
  });

  it("completion is completed over assigned", () => {
    expect(completionRate(counts({ assigned: 4, completed: 3 }))).toBe(0.75);
  });

  it("on time only counts completed tasks that had a due date", () => {
    expect(onTimeRate(counts({ completed: 5, completedWithDue: 4, completedOnTime: 3 }))).toBe(0.75);
  });
});

describe("sumCounts", () => {
  it("adds the counts and weights the average by tasks completed", () => {
    const total = sumCounts([
      counts({ assigned: 4, completed: 3, completedWithDue: 2, completedOnTime: 1, overdue: 1, avgCompletionSeconds: 3600 }),
      counts({ assigned: 2, completed: 1, completedWithDue: 1, completedOnTime: 1, avgCompletionSeconds: 7200 }),
      counts({ assigned: 1 }),
    ]);
    expect(total).toEqual({
      assigned: 7,
      completed: 4,
      completedWithDue: 3,
      completedOnTime: 2,
      overdue: 1,
      avgCompletionSeconds: 4500,
    });
  });

  it("has no average when nothing was completed", () => {
    expect(sumCounts([counts({ assigned: 2 })]).avgCompletionSeconds).toBeNull();
    expect(sumCounts([])).toEqual(NO_COUNTS);
  });
});

describe("durationParts", () => {
  it("uses hours under two days and days after", () => {
    expect(durationParts(60)).toEqual({ unit: "hours", count: 1 });
    expect(durationParts(5 * 3600)).toEqual({ unit: "hours", count: 5 });
    expect(durationParts(47 * 3600)).toEqual({ unit: "hours", count: 47 });
    expect(durationParts(48 * 3600)).toEqual({ unit: "days", count: 2 });
    expect(durationParts(10 * 86400)).toEqual({ unit: "days", count: 10 });
  });
});
