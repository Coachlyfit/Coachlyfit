import { describe, expect, it } from "vitest";
import { computeSessionSummary, computeSessionTotals } from "./summary";

describe("computeSessionSummary", () => {
  it("sums weight*reps across all logged sets", () => {
    const summary = computeSessionSummary([
      { weight: 60, reps: 8 },
      { weight: 40, reps: 10 },
    ]);
    expect(summary.totalVolume).toBe(880);
    expect(summary.setsCompleted).toBe(2);
  });

  it("bodyweight sets (weight null) contribute 0 volume but still count", () => {
    const summary = computeSessionSummary([{ weight: null, reps: 12 }]);
    expect(summary.totalVolume).toBe(0);
    expect(summary.setsCompleted).toBe(1);
  });

  it("returns zeros for no logs", () => {
    expect(computeSessionSummary([])).toEqual({ totalVolume: 0, setsCompleted: 0 });
  });
});

describe("assisted sets", () => {
  it("add no volume (negative weight is help received, not load lifted)", () => {
    expect(computeSessionSummary([{ weight: -20, reps: 8 }]).totalVolume).toBe(0);
  });
});

describe("computeSessionTotals", () => {
  it("sums work time, distance and calories, ignoring sets without them", () => {
    expect(
      computeSessionTotals([
        { duration_seconds: 45, distance_m: null, calories: null },
        { duration_seconds: 1800, distance_m: 5000, calories: 300 },
        {},
      ])
    ).toEqual({ totalDurationSeconds: 1845, totalDistanceM: 5000, totalCalories: 300 });
  });

  it("is all zeros for a session of plain strength sets", () => {
    expect(computeSessionTotals([{ duration_seconds: null }])).toEqual({
      totalDurationSeconds: 0,
      totalDistanceM: 0,
      totalCalories: 0,
    });
  });
});
