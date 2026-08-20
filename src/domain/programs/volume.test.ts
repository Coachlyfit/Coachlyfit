import { describe, expect, it } from "vitest";
import { muscleGroupWeeklyVolume } from "./volume";

function item(muscleGroup: string | null, setCount: number) {
  return {
    program_item_sets: Array.from({ length: setCount }, (_, i) => ({ set_index: i + 1 })),
    exercises: { muscle_group: muscleGroup },
  };
}

describe("muscleGroupWeeklyVolume", () => {
  it("sums set counts per known muscle group across all days", () => {
    const days = [
      { program_items: [item("chest", 3), item("back", 4)] },
      { program_items: [item("chest", 2)] },
    ];
    const result = muscleGroupWeeklyVolume(days);
    expect(result.find((r) => r.muscleGroup === "chest")?.sets).toBe(5);
    expect(result.find((r) => r.muscleGroup === "back")?.sets).toBe(4);
    expect(result.find((r) => r.muscleGroup === "legs")?.sets).toBe(0);
  });

  it("buckets unknown/legacy free-text muscle_group values into 'other'", () => {
    const days = [{ program_items: [item("Old Legs Typo", 3)] }];
    expect(muscleGroupWeeklyVolume(days).find((r) => r.muscleGroup === "other")?.sets).toBe(3);
  });

  it("buckets a null muscle_group into 'other'", () => {
    const days = [{ program_items: [item(null, 2)] }];
    expect(muscleGroupWeeklyVolume(days).find((r) => r.muscleGroup === "other")?.sets).toBe(2);
  });

  it("returns all 10 groups with zero counts when given no days", () => {
    const result = muscleGroupWeeklyVolume([]);
    expect(result).toHaveLength(10);
    expect(result.every((r) => r.sets === 0)).toBe(true);
  });
});
