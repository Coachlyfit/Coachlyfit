import { describe, expect, it } from "vitest";
import { suggestNextWeight } from "./suggest";

describe("suggestNextWeight", () => {
  it("returns null/unchanged for a bodyweight exercise (no weight)", () => {
    expect(suggestNextWeight({ lastWeight: null, lastReps: 10, lastRpe: 6, targetReps: 10 })).toBeNull();
  });

  it("bumps weight by 2.5kg when RPE was 7 or below", () => {
    expect(suggestNextWeight({ lastWeight: 60, lastReps: 8, lastRpe: 7, targetReps: 8 })).toBe(62.5);
    expect(suggestNextWeight({ lastWeight: 60, lastReps: 8, lastRpe: 6, targetReps: 8 })).toBe(62.5);
  });

  it("keeps the same weight when RPE was 8-10", () => {
    expect(suggestNextWeight({ lastWeight: 60, lastReps: 8, lastRpe: 8, targetReps: 8 })).toBe(60);
    expect(suggestNextWeight({ lastWeight: 60, lastReps: 8, lastRpe: 10, targetReps: 8 })).toBe(60);
  });

  it("keeps the same weight when no RPE was recorded — never guesses", () => {
    expect(suggestNextWeight({ lastWeight: 60, lastReps: 8, lastRpe: null, targetReps: 8 })).toBe(60);
  });

  it("keeps the same weight (no deload) when target reps were missed, regardless of RPE", () => {
    expect(suggestNextWeight({ lastWeight: 60, lastReps: 5, lastRpe: 6, targetReps: 8 })).toBe(60);
  });

  it("rounds to the nearest 0.25kg", () => {
    expect(suggestNextWeight({ lastWeight: 61.3, lastReps: 8, lastRpe: 6, targetReps: 8 })).toBe(63.75);
  });

  it("returns lastWeight unchanged for a zero or negative weight", () => {
    expect(suggestNextWeight({ lastWeight: 0, lastReps: 8, lastRpe: 6, targetReps: 8 })).toBe(0);
  });
});
