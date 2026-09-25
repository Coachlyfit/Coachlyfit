import { describe, expect, it } from "vitest";
import { projectSetsForWeek, type BaseSet } from "./progression";

const base: BaseSet[] = [
  { set_index: 1, reps: 10, weight: 50, rest_seconds: 90, duration_seconds: null },
  { set_index: 2, reps: 8, weight: null, rest_seconds: 90, duration_seconds: null }, // bodyweight set
];

describe("projectSetsForWeek", () => {
  it("returns the base unmodified at week 1, regardless of rule", () => {
    expect(projectSetsForWeek(base, "plus_2_5kg_week", 1)).toEqual(base);
  });

  it.each([4, 8, 12])("returns the base unmodified at deload week %i, regardless of rule", (week) => {
    expect(projectSetsForWeek(base, "plus_5kg_week", week)).toEqual(base);
  });

  it("never changes anything under rule 'none'", () => {
    expect(projectSetsForWeek(base, "none", 7)).toEqual(base);
  });

  it("applies +2.5kg per week since base, ignoring an intervening deload", () => {
    const result = projectSetsForWeek(base, "plus_2_5kg_week", 5);
    expect(result[0].weight).toBe(50 + 2.5 * 4);
    expect(result[1].weight).toBeNull(); // bodyweight set stays null
  });

  it("applies +5kg per week since base", () => {
    const result = projectSetsForWeek(base, "plus_5kg_week", 3);
    expect(result[0].weight).toBe(50 + 5 * 2);
  });

  it("applies +1 rep per week since base", () => {
    const result = projectSetsForWeek(base, "plus_1_rep_week", 6);
    expect(result[0].reps).toBe(10 + 5);
    expect(result[1].reps).toBe(8 + 5);
  });

  it("clamps week above MAX_PROGRAM_WEEKS to week 12's projection", () => {
    expect(projectSetsForWeek(base, "plus_2_5kg_week", 20)).toEqual(projectSetsForWeek(base, "plus_2_5kg_week", 12));
  });

  it("clamps week below 1 to week 1's base", () => {
    expect(projectSetsForWeek(base, "plus_2_5kg_week", 0)).toEqual(base);
  });

  it("leaves a duration-based set's hold time unprojected under any rule", () => {
    const holdSet: BaseSet[] = [{ set_index: 1, reps: null, weight: null, rest_seconds: 30, duration_seconds: 30 }];
    const result = projectSetsForWeek(holdSet, "plus_1_rep_week", 6);
    expect(result[0].duration_seconds).toBe(30);
    expect(result[0].reps).toBeNull();
  });
});
