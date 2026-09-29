import { describe, expect, it } from "vitest";
import { accumulateMuscleVolume, exerciseToBodyState, normalizeVolumeToIntensity } from "./muscle-regions";

describe("exerciseToBodyState", () => {
  it("puts primary muscles at 10 and secondary at 5, both sides", () => {
    const state = exerciseToBodyState(["Pectoralis Major Clavicular"], ["Anterior Deltoid"]);
    expect(state["chest-upper-left"]).toBe(10);
    expect(state["chest-upper-right"]).toBe(10);
    expect(state["shoulder-front-left"]).toBe(5);
    expect(state["shoulder-front-right"]).toBe(5);
  });

  it("is case/whitespace insensitive", () => {
    expect(exerciseToBodyState(["  biceps Brachii  "], [])["biceps-left"]).toBe(10);
  });

  it("max-merges when a muscle appears as both primary and secondary", () => {
    const state = exerciseToBodyState(["Trapezius"], ["Trapezius Upper"]);
    expect(state["traps-upper-left"]).toBe(10);
  });

  it("drops unmapped free-text names instead of guessing", () => {
    expect(exerciseToBodyState(["not a real muscle"], [])).toEqual({});
  });

  it("falls back to the coarse muscle_group when no detailed muscles map", () => {
    const state = exerciseToBodyState([], [], "chest");
    expect(state["chest-upper-left"]).toBe(6);
    expect(state["chest-lower-right"]).toBe(6);
  });

  it("does not fall back when detailed muscles did map", () => {
    const state = exerciseToBodyState(["Quadriceps"], [], "chest");
    expect(state["quads-left"]).toBe(10);
    expect(state["chest-upper-left"]).toBeUndefined();
  });
});

describe("accumulateMuscleVolume / normalizeVolumeToIntensity", () => {
  it("weights primary sets full and secondary sets half, additive across exercises", () => {
    const totals = accumulateMuscleVolume([
      { primaryMuscles: ["Quadriceps"], secondaryMuscles: ["Hamstrings"], sets: 4 },
      { primaryMuscles: ["Quadriceps"], secondaryMuscles: [], sets: 2 },
    ]);
    expect(totals["quads-left"]).toBe(6);
    expect(totals["hamstrings-medial-left"]).toBe(2);
  });

  it("normalizes so the busiest region hits 10", () => {
    const intensity = normalizeVolumeToIntensity({ "quads-left": 6, "hamstrings-medial-left": 2 });
    expect(intensity["quads-left"]).toBe(10);
    expect(intensity["hamstrings-medial-left"]).toBe(3);
  });

  it("returns empty state for empty input rather than dividing by zero", () => {
    expect(normalizeVolumeToIntensity({})).toEqual({});
  });
});
