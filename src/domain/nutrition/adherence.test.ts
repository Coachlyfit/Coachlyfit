import { describe, expect, it } from "vitest";
import {
  dayStatuses,
  leadingBlanks,
  monthRange,
  nutritionAdherence,
  parseMonth,
  shiftMonth,
  type NutritionLogDay,
} from "./adherence";

const log = (log_date: string, kcal: number | null = 2000, off_plan = false): NutritionLogDay => ({
  log_date,
  kcal,
  off_plan,
});

describe("nutritionAdherence", () => {
  it("counts logged days (kcal or off-plan) over the inclusive range", () => {
    const logs = [log("2026-09-01"), log("2026-09-02", null, true), log("2026-09-04")];
    expect(nutritionAdherence(logs, { from: "2026-09-01", to: "2026-09-05" })).toMatchObject({
      loggedDays: 3,
      totalDays: 5,
      offPlanDays: 1,
      rate: 60,
    });
  });

  it("ignores logs outside the range", () => {
    const logs = [log("2026-08-31"), log("2026-09-01"), log("2026-09-06")];
    expect(nutritionAdherence(logs, { from: "2026-09-01", to: "2026-09-05" })).toMatchObject({ loggedDays: 1 });
  });

  it("current streak counts back from yesterday when today isn't logged yet", () => {
    const logs = [log("2026-09-03"), log("2026-09-04")];
    expect(nutritionAdherence(logs, { from: "2026-09-01", to: "2026-09-05" }).currentStreak).toBe(2);
  });

  it("an off-plan day keeps the streak going", () => {
    const logs = [log("2026-09-03"), log("2026-09-04", null, true), log("2026-09-05")];
    expect(nutritionAdherence(logs, { from: "2026-09-01", to: "2026-09-05" }).currentStreak).toBe(3);
  });

  it("a gap ends the current streak; longest streak spans the whole history", () => {
    const logs = [log("2026-08-01"), log("2026-08-02"), log("2026-08-03"), log("2026-09-05")];
    expect(nutritionAdherence(logs, { from: "2026-09-01", to: "2026-09-05" })).toMatchObject({
      currentStreak: 1,
      longestStreak: 3,
    });
  });

  it("streaks across a month boundary", () => {
    const logs = [log("2026-08-31"), log("2026-09-01")];
    expect(nutritionAdherence(logs, { from: "2026-08-31", to: "2026-09-01" }).currentStreak).toBe(2);
  });

  it("empty range has no rate", () => {
    expect(nutritionAdherence([], { from: "2026-09-05", to: "2026-09-01" })).toMatchObject({
      totalDays: 0,
      rate: null,
      currentStreak: 0,
      longestStreak: 0,
    });
  });
});

describe("dayStatuses", () => {
  it("marks logged, off-plan, missed and future days", () => {
    const logs = [log("2026-09-01"), log("2026-09-02", 1800, true)];
    expect(dayStatuses(logs, { from: "2026-09-01", to: "2026-09-04" }, "2026-09-03")).toEqual([
      { date: "2026-09-01", status: "logged" },
      { date: "2026-09-02", status: "off_plan" },
      { date: "2026-09-03", status: "missed" },
      { date: "2026-09-04", status: "future" },
    ]);
  });
});

describe("month helpers", () => {
  it("parses a month param, falling back to today's month", () => {
    expect(parseMonth("2026-02", "2026-09-30")).toBe("2026-02");
    expect(parseMonth("2026-13", "2026-09-30")).toBe("2026-09");
    expect(parseMonth(undefined, "2026-09-30")).toBe("2026-09");
  });

  it("covers the whole month, including leap-year February", () => {
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("shifts across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("counts blanks before the 1st for Sunday- and Saturday-start weeks", () => {
    // 2026-09-01 is a Tuesday
    expect(leadingBlanks("2026-09-01", 0)).toBe(2);
    expect(leadingBlanks("2026-09-01", 6)).toBe(3);
  });
});
