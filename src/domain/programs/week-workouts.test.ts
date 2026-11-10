import { describe, expect, it } from "vitest";
import { weekWorkoutCounts } from "./week-workouts";

const day = (day_index: number, blocks: string[], weekday: number | null = null) => ({
  id: `d${day_index}`,
  day_index,
  weekday,
  program_items: blocks.map((block) => ({ block })),
});

// Cycle of 3 days: train, rest, train — repeats every 3 calendar days.
const program = {
  start_date: "2026-08-01", // Saturday
  schedule_mode: "cycle",
  program_days: [day(1, ["main"]), day(2, []), day(3, ["warmup", "main"])],
};

describe("weekWorkoutCounts", () => {
  it("plans only days with workout blocks", () => {
    // Sat..Fri = idx 1,2,3,1,2,3,1 -> train days: 1,3,1,3,1 = 5
    expect(weekWorkoutCounts(program, "2026-08-01", []).planned).toBe(5);
  });

  it("counts completed sessions started in the week only", () => {
    const r = weekWorkoutCounts(program, "2026-08-01", ["2026-08-01T07:00:00Z", "2026-08-03T07:00:00Z", "2026-07-30T07:00:00Z"]);
    expect(r).toEqual({ planned: 5, done: 2 });
  });

  it("never reports done above planned", () => {
    const many = Array.from({ length: 8 }, () => "2026-08-02T07:00:00Z");
    expect(weekWorkoutCounts(program, "2026-08-01", many)).toEqual({ planned: 5, done: 5 });
  });

  it("a rehab-only day is not a planned workout", () => {
    const p = { ...program, program_days: [day(1, ["rehab"])] };
    expect(weekWorkoutCounts(p, "2026-08-01", []).planned).toBe(0);
  });
});
