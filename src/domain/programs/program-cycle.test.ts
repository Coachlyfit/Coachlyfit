import { describe, expect, it } from "vitest";
import { dayIndexForDate, dayIndicesForWeek, startOfWeekSaturday, weekIndexForDate } from "./program-cycle";

describe("dayIndexForDate", () => {
  it("day 1 lands exactly on start_date", () => {
    expect(dayIndexForDate("2026-08-01", 5, "2026-08-01")).toBe(1);
  });

  it("cycles back to day 1 after cycleLength days", () => {
    expect(dayIndexForDate("2026-08-01", 5, "2026-08-06")).toBe(1);
  });

  it("advances within a cycle", () => {
    expect(dayIndexForDate("2026-08-01", 5, "2026-08-03")).toBe(3);
  });

  it("returns null before the program starts", () => {
    expect(dayIndexForDate("2026-08-01", 5, "2026-07-31")).toBeNull();
  });

  it("returns null for a program with zero days", () => {
    expect(dayIndexForDate("2026-08-01", 0, "2026-08-01")).toBeNull();
  });
});

describe("dayIndicesForWeek", () => {
  it("returns 7 day_indices cycling from the week's start date", () => {
    expect(dayIndicesForWeek("2026-08-01", 5, "2026-08-01")).toEqual([1, 2, 3, 4, 5, 1, 2]);
  });

  it("returns null for dates before the program started", () => {
    expect(dayIndicesForWeek("2026-08-03", 3, "2026-08-01")).toEqual([null, null, 1, 2, 3, 1, 2]);
  });
});

describe("weekIndexForDate", () => {
  it("week 1 covers start_date through 6 days later", () => {
    expect(weekIndexForDate("2026-08-01", "2026-08-01")).toBe(1);
    expect(weekIndexForDate("2026-08-01", "2026-08-07")).toBe(1);
  });

  it("rolls over to week 2 on day 7 since start", () => {
    expect(weekIndexForDate("2026-08-01", "2026-08-08")).toBe(2);
  });

  it("clamps to maxWeeks instead of progressing forever", () => {
    expect(weekIndexForDate("2026-08-01", "2027-01-01", 12)).toBe(12);
  });

  it("floors to week 1 for a date before the program started", () => {
    expect(weekIndexForDate("2026-08-01", "2026-07-01")).toBe(1);
  });
});

describe("startOfWeekSaturday", () => {
  it("returns the same date when it's already a Saturday", () => {
    // 2026-08-01 is a Saturday.
    expect(startOfWeekSaturday("2026-08-01")).toBe("2026-08-01");
  });

  it("rewinds a Friday to the Saturday six days earlier", () => {
    // 2026-08-07 is a Friday.
    expect(startOfWeekSaturday("2026-08-07")).toBe("2026-08-01");
  });

  it("rewinds a mid-week Wednesday to that week's Saturday", () => {
    // 2026-08-05 is a Wednesday.
    expect(startOfWeekSaturday("2026-08-05")).toBe("2026-08-01");
  });
});
