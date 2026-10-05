import { describe, expect, it } from "vitest";
import { ENDING_SOON_DAYS, STATUS_ORDER, planProgress, planStatus } from "./plan-status";

const TODAY = "2026-10-05";

describe("planStatus", () => {
  it("is notStarted when the start date is in the future", () => {
    expect(planStatus("2026-10-06", "2026-12-06", TODAY)).toBe("notStarted");
    // Even when it would also end within the threshold.
    expect(planStatus("2026-10-06", "2026-10-08", TODAY)).toBe("notStarted");
  });

  it("is ended once the end date has passed", () => {
    expect(planStatus("2026-08-01", "2026-10-04", TODAY)).toBe("ended");
  });

  it("is endingSoon from the last day up to the threshold", () => {
    expect(ENDING_SOON_DAYS).toBe(7);
    expect(planStatus("2026-08-01", TODAY, TODAY)).toBe("endingSoon");
    expect(planStatus("2026-08-01", "2026-10-12", TODAY)).toBe("endingSoon");
    expect(planStatus("2026-08-01", "2026-10-13", TODAY)).toBe("active");
  });

  it("is active with no end date, or starting today", () => {
    expect(planStatus("2026-08-01", null, TODAY)).toBe("active");
    expect(planStatus(TODAY, "2026-12-01", TODAY)).toBe("active");
  });

  it("orders ending soon, active, not started, ended", () => {
    expect(STATUS_ORDER).toEqual(["endingSoon", "active", "notStarted", "ended"]);
  });
});

describe("planProgress", () => {
  it("counts both ends of the range", () => {
    expect(planProgress("2026-09-29", "2026-11-30", TODAY)).toEqual({ day: 7, total: 63, pct: 11, startsIn: 0 });
  });

  it("reports days until start and no progress before the plan begins", () => {
    expect(planProgress("2026-10-12", "2026-12-12", TODAY)).toEqual({ day: 0, total: 62, pct: 0, startsIn: 7 });
  });

  it("caps at the last day once ended", () => {
    expect(planProgress("2026-08-01", "2026-08-10", TODAY)).toMatchObject({ day: 10, total: 10, pct: 100 });
  });

  it("has no total or percentage without an end date", () => {
    expect(planProgress("2026-10-01", null, TODAY)).toEqual({ day: 5, total: null, pct: null, startsIn: 0 });
  });

  it("survives an end date before the start date", () => {
    expect(planProgress("2026-10-01", "2026-09-01", TODAY)).toMatchObject({ day: 1, total: 1, pct: 100 });
  });
});
