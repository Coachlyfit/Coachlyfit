import { describe, expect, it } from "vitest";
import {
  computeMeasureRecords,
  computePersonalRecords,
  computeRecentPersonalRecords,
  estimateOneRepMax,
  liftKindFromName,
  weeklyVolume,
  type SetLogForMeasure,
  type SetLogForPr,
} from "./prs";

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

describe("computeMeasureRecords", () => {
  const set = (overrides: Partial<SetLogForMeasure>): SetLogForMeasure => ({ exercise_id: "ex-1", ...overrides });

  it("tracks the longest hold and the max reps", () => {
    const [rec] = computeMeasureRecords([
      set({ duration_seconds: 45 }),
      set({ duration_seconds: 90 }),
      set({ duration_seconds: 60 }),
      set({ reps: 12 }),
      set({ reps: 15 }),
    ]);
    expect(rec.maxDuration).toBe(90);
    expect(rec.maxReps).toBe(15);
    expect(rec.totalDurationSeconds).toBe(195);
  });

  it("derives best pace (seconds per km, lower is better) from sets with both time and distance", () => {
    const [rec] = computeMeasureRecords([
      set({ distance_m: 5000, duration_seconds: 1800 }), // 360 s/km
      set({ distance_m: 5000, duration_seconds: 1500 }), // 300 s/km
      set({ distance_m: 10_000, duration_seconds: 3600 }), // 360 s/km
    ]);
    expect(rec.bestPace).toBe(300);
    expect(rec.maxDistance).toBe(10_000);
    expect(rec.totalDistanceM).toBe(20_000);
  });

  it("ignores a pace over a distance too short to mean anything", () => {
    const [rec] = computeMeasureRecords([set({ distance_m: 20, duration_seconds: 3 })]);
    expect(rec.bestPace).toBeNull();
    expect(rec.maxDistance).toBe(20);
  });

  it("separates exercises and drops ones with nothing to report", () => {
    const records = computeMeasureRecords([
      set({ exercise_id: "a", calories: 150 }),
      set({ exercise_id: "b", reps: null, duration_seconds: null }),
    ]);
    expect(records.map((r) => r.exerciseId)).toEqual(["a"]);
    expect(records[0].maxCalories).toBe(150);
  });

  it("returns nothing for no logs", () => {
    expect(computeMeasureRecords([])).toEqual([]);
  });
});

describe("assisted sets (negative weight)", () => {
  it("are not strength PRs and add nothing to volume", () => {
    expect(computePersonalRecords([log({ weight: -20, reps: 8 })])).toEqual([]);
    expect(weeklyVolume([log({ weight: -20, reps: 8, completed_at: "2026-01-05T10:00:00Z" })])).toEqual([
      { weekStart: "2026-01-05", volumeKg: 0 },
    ]);
  });
});

describe("1RM estimate rules", () => {
  it("ignores sets too far from a max effort: over 12 reps, or over 3 reps of an Olympic lift", () => {
    expect(estimateOneRepMax(60, 15)).toBeNull();
    expect(estimateOneRepMax(100, 12)).toBe(140);
    expect(estimateOneRepMax(80, 5, "olympic")).toBeNull();
    expect(estimateOneRepMax(80, 3, "olympic")).toBe(88);
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(0, 5)).toBeNull();
  });

  it("recognises Olympic lifts by name and nothing else", () => {
    expect(["Clean and Jerk", "power clean", "Snatch Pull", "barbell snatch"].map(liftKindFromName)).toEqual(Array(4).fill("olympic"));
    expect(["Barbell Squat", "Cleaner Bench", "Jerky Row", null].map(liftKindFromName)).toEqual(Array(4).fill("standard"));
  });

  it("a high-rep set still sets the heaviest-weight record but not the 1RM estimate", () => {
    const [pr] = computePersonalRecords([
      { exercise_id: "ex", weight: 60, reps: 20, completed_at: "2026-01-01T10:00:00Z" },
      { exercise_id: "ex", weight: 50, reps: 5, completed_at: "2026-01-02T10:00:00Z" },
    ]);
    expect(pr.maxWeight).toMatchObject({ weight: 60, reps: 20 });
    expect(pr.estimatedOneRepMax).toMatchObject({ fromWeight: 50, fromReps: 5 });
  });

  it("an Olympic lift only estimates from sets of 3 or fewer", () => {
    const [pr] = computePersonalRecords([
      { exercise_id: "ex", weight: 90, reps: 5, completed_at: "2026-01-01T10:00:00Z", lift: "olympic" },
      { exercise_id: "ex", weight: 80, reps: 2, completed_at: "2026-01-02T10:00:00Z", lift: "olympic" },
    ]);
    expect(pr.estimatedOneRepMax).toMatchObject({ fromWeight: 80, fromReps: 2 });
  });
});
