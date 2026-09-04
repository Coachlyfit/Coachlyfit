import { describe, expect, it } from "vitest";
import { computePersonalRecords, computeRecentPersonalRecords, weeklyVolume, type SetLogForPr } from "./prs";

function log(overrides: Partial<SetLogForPr>): SetLogForPr {
  return {
    exercise_id: "ex-1",
    weight: 60,
    reps: 8,
    completed_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

describe("computePersonalRecords", () => {
  it("returns the heaviest weight and best estimated 1RM per exercise", () => {
    const logs = [
      log({ weight: 60, reps: 8, completed_at: "2026-01-01T10:00:00Z" }),
      log({ weight: 65, reps: 5, completed_at: "2026-01-08T10:00:00Z" }),
      log({ weight: 50, reps: 12, completed_at: "2026-01-15T10:00:00Z" }),
    ];
    const [pr] = computePersonalRecords(logs);

    expect(pr.exerciseId).toBe("ex-1");
    expect(pr.maxWeight).toEqual({ weight: 65, reps: 5, completedAt: "2026-01-08T10:00:00Z" });
  });

  it("computes estimated 1RM via the Epley formula, rounded to the nearest 0.5kg", () => {
    const logs = [log({ weight: 100, reps: 5, completed_at: "2026-01-01T10:00:00Z" })];
    const [pr] = computePersonalRecords(logs);
    // 100 * (1 + 5/30) = 116.666... -> rounds to 116.5
    expect(pr.estimatedOneRepMax).toEqual({ value: 116.5, fromWeight: 100, fromReps: 5, completedAt: "2026-01-01T10:00:00Z" });
  });

  it("a single-rep set's estimated 1RM equals the raw weight", () => {
    const logs = [log({ weight: 120, reps: 1, completed_at: "2026-01-01T10:00:00Z" })];
    const [pr] = computePersonalRecords(logs);
    expect(pr.estimatedOneRepMax?.value).toBe(120);
  });

  it("ignores sets with no weight (bodyweight) or no reps recorded", () => {
    const logs = [
      log({ weight: null, reps: 12, completed_at: "2026-01-01T10:00:00Z" }),
      log({ weight: 60, reps: null, completed_at: "2026-01-02T10:00:00Z" }),
    ];
    expect(computePersonalRecords(logs)).toEqual([]);
  });

  it("ignores zero or negative weight/reps", () => {
    const logs = [log({ weight: 0, reps: 8 }), log({ weight: 60, reps: 0 })];
    expect(computePersonalRecords(logs)).toEqual([]);
  });

  it("groups separately per exercise_id", () => {
    const logs = [
      log({ exercise_id: "ex-1", weight: 60, reps: 8 }),
      log({ exercise_id: "ex-2", weight: 100, reps: 3 }),
    ];
    const records = computePersonalRecords(logs);
    expect(records.map((r) => r.exerciseId).sort()).toEqual(["ex-1", "ex-2"]);
  });

  it("returns an empty array for no logs", () => {
    expect(computePersonalRecords([])).toEqual([]);
  });
});

describe("computeRecentPersonalRecords", () => {
  it("only returns PRs whose record-setting set is on/after the cutoff", () => {
    const logs = [
      log({ weight: 60, reps: 8, completed_at: "2026-01-01T10:00:00Z" }),
      log({ weight: 65, reps: 8, completed_at: "2026-01-10T10:00:00Z" }),
    ];
    const recent = computeRecentPersonalRecords(logs, "2026-01-05T00:00:00Z");
    expect(recent).toHaveLength(1);
    expect(recent[0].maxWeight?.weight).toBe(65);
  });

  it("returns nothing when the best set predates the cutoff", () => {
    const logs = [log({ weight: 60, reps: 8, completed_at: "2026-01-01T10:00:00Z" })];
    expect(computeRecentPersonalRecords(logs, "2026-01-05T00:00:00Z")).toEqual([]);
  });
});

describe("weeklyVolume", () => {
  it("sums weight*reps per ISO (Monday-anchored) week, oldest first", () => {
    const logs = [
      log({ weight: 60, reps: 8, completed_at: "2026-01-07T10:00:00Z" }), // Wed
      log({ weight: 60, reps: 8, completed_at: "2026-01-09T10:00:00Z" }), // Fri, same week
      log({ weight: 100, reps: 5, completed_at: "2026-01-14T10:00:00Z" }), // next week (Wed)
    ];
    const points = weeklyVolume(logs);
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({ weekStart: "2026-01-05", volumeKg: 960 });
    expect(points[1]).toEqual({ weekStart: "2026-01-12", volumeKg: 500 });
  });

  it("bodyweight sets (weight null) contribute 0kg, not a gap", () => {
    const logs = [log({ weight: null, reps: 12, completed_at: "2026-01-07T10:00:00Z" })];
    expect(weeklyVolume(logs)).toEqual([{ weekStart: "2026-01-05", volumeKg: 0 }]);
  });

  it("returns an empty array for no logs", () => {
    expect(weeklyVolume([])).toEqual([]);
  });
});
