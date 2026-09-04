import { describe, expect, it } from "vitest";
import { computeSessionSummary } from "./summary";

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
