import { describe, expect, it } from "vitest";
import { dayTargets, resolveDietDay } from "./diet-days";

const day = (id: string, kind: string, order_index: number) => ({ id, kind, order_index });

const rest = day("rest", "rest", 0);
const training = day("train", "training", 1);
const custom = day("cheat", "custom", 2);
// Deliberately out of order: resolution must use order_index, not array order.
const days = [custom, training, rest];

describe("resolveDietDay", () => {
  it("returns the day mapped to the weekday", () => {
    const schedule = [
      { weekday: 5, diet_plan_day_id: "rest" },
      { weekday: 6, diet_plan_day_id: "cheat" },
    ];
    expect(resolveDietDay(days, schedule, 5)?.id).toBe("rest");
    expect(resolveDietDay(days, schedule, 6)?.id).toBe("cheat");
  });

  it("falls back to the first training day for an unmapped weekday", () => {
    const schedule = [{ weekday: 5, diet_plan_day_id: "rest" }];
    expect(resolveDietDay(days, schedule, 1)?.id).toBe("train");
  });

  it("falls back to the first training day when there is no schedule at all", () => {
    expect(resolveDietDay(days, [], 0)?.id).toBe("train");
  });

  it("falls back to the first day by order_index when no day is a training day", () => {
    expect(resolveDietDay([custom, rest], [], 3)?.id).toBe("rest");
  });

  it("picks the lowest-order training day when there are several", () => {
    const second = day("train2", "training", 0);
    expect(resolveDietDay([training, second], [], 2)?.id).toBe("train2");
  });

  it("ignores a schedule row pointing at a day that no longer exists", () => {
    expect(resolveDietDay(days, [{ weekday: 2, diet_plan_day_id: "gone" }], 2)?.id).toBe("train");
  });

  it("returns the only day of a single-day plan on any weekday", () => {
    const only = day("all", "custom", 0);
    for (let weekday = 0; weekday <= 6; weekday++) expect(resolveDietDay([only], [], weekday)?.id).toBe("all");
  });

  it("returns null for a plan with no days", () => {
    expect(resolveDietDay([], [], 0)).toBeNull();
  });
});

describe("dayTargets", () => {
  const plan = { target_kcal: 2000, target_protein_g: 150, target_carb_g: 200, target_fat_g: 60 };

  it("uses the day's own targets", () => {
    const own = { target_kcal: 2500, target_protein_g: 160, target_carb_g: 300, target_fat_g: 70 };
    expect(dayTargets(own, plan)).toEqual(own);
  });

  it("falls back to the plan per field when the day leaves one unset", () => {
    const partial = { target_kcal: 1800, target_protein_g: null, target_carb_g: 120, target_fat_g: null };
    expect(dayTargets(partial, plan)).toEqual({
      target_kcal: 1800,
      target_protein_g: 150,
      target_carb_g: 120,
      target_fat_g: 60,
    });
  });

  it("uses the plan when there is no day", () => {
    expect(dayTargets(null, plan)).toEqual(plan);
  });
});
