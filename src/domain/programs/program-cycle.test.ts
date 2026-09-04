import { describe, expect, it } from "vitest";
import {
  dayIndexForDate,
  dayIndexForDateWithMode,
  dayIndicesForWeek,
  dayIndicesForWeekWithMode,
  startOfWeekSaturday,
  weekIndexForDate,
} from "./program-cycle";

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

describe("dayIndexForDateWithMode", () => {
  it("cycle mode delegates straight to dayIndexForDate", () => {
    expect(dayIndexForDateWithMode("cycle", "2026-08-01", 5, "2026-08-03", new Map())).toBe(3);
  });

  it("weekly mode resolves via the weekday lookup — 2026-08-01 is a Saturday (getUTCDay 6)", () => {
    const weekdayToDayIndex = new Map([[6, 1]]); // Saturday -> day 1
    expect(dayIndexForDateWithMode("weekly", "2026-08-01", 0, "2026-08-01", weekdayToDayIndex)).toBe(1);
  });

  it("weekly mode returns null (rest day) for a weekday with no mapped program_day", () => {
    const weekdayToDayIndex = new Map([[6, 1]]);
    // 2026-08-02 is a Sunday (getUTCDay 0), not in the map.
    expect(dayIndexForDateWithMode("weekly", "2026-08-01", 0, "2026-08-02", weekdayToDayIndex)).toBeNull();
  });

  it("weekly mode returns null before the program started", () => {
    const weekdayToDayIndex = new Map([[6, 1]]);
    expect(dayIndexForDateWithMode("weekly", "2026-08-01", 0, "2026-07-31", weekdayToDayIndex)).toBeNull();
  });
});

describe("dayIndicesForWeekWithMode", () => {
  it("weekly mode maps each of the 7 dates through the weekday lookup", () => {
    // Week starting Saturday 2026-08-01: Sat, Sun, Mon, Tue, Wed, Thu, Fri
    // -> getUTCDay 6, 0, 1, 2, 3, 4, 5.
    const weekdayToDayIndex = new Map([
      [6, 1], // Saturday -> day 1
      [1, 2], // Monday -> day 2
      [3, 3], // Wednesday -> day 3
    ]);
    expect(dayIndicesForWeekWithMode("weekly", "2026-08-01", 0, "2026-08-01", weekdayToDayIndex)).toEqual([
      1, null, 2, null, 3, null, null,
    ]);
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
