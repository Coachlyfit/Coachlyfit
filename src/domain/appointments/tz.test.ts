import { describe, expect, it } from "vitest";
import { addDays, weekdayOf, zonedToUtc } from "./tz";

describe("zonedToUtc", () => {
  it("applies the winter and summer Cairo offsets", () => {
    expect(zonedToUtc("2026-01-15", "12:00", "Africa/Cairo")?.toISOString()).toBe("2026-01-15T10:00:00.000Z");
    expect(zonedToUtc("2026-07-15", "12:00", "Africa/Cairo")?.toISOString()).toBe("2026-07-15T09:00:00.000Z");
  });

  it("handles the US spring-forward day", () => {
    expect(zonedToUtc("2026-03-07", "12:00", "America/New_York")?.toISOString()).toBe("2026-03-07T17:00:00.000Z");
    expect(zonedToUtc("2026-03-08", "03:30", "America/New_York")?.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("returns null for a wall-clock time that was skipped", () => {
    expect(zonedToUtc("2026-03-08", "02:30", "America/New_York")).toBeNull();
  });

  it("resolves the repeated fall-back hour to some instant", () => {
    expect(zonedToUtc("2026-11-01", "01:30", "America/New_York")).not.toBeNull();
  });

  it("accepts HH:MM:SS from Postgres time columns", () => {
    expect(zonedToUtc("2026-01-15", "12:00:00", "Africa/Cairo")?.toISOString()).toBe("2026-01-15T10:00:00.000Z");
  });
});

describe("date helpers", () => {
  it("computes weekday and day arithmetic across month ends", () => {
    expect(weekdayOf("2026-01-18")).toBe(0); // Sunday
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
