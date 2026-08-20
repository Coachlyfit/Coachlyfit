import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import {
  adherenceAverage,
  checkinStreak,
  lastCheckinDate,
  parseRange,
  rangeStart,
  weightTrend,
} from "./stats";

type CheckinRow = Database["public"]["Tables"]["checkins"]["Row"];

function checkin(overrides: Partial<CheckinRow> & { checkin_date: string }): CheckinRow {
  return {
    id: "id",
    coach_id: "coach-1",
    client_id: "client-1",
    created_at: "2026-01-01T00:00:00Z",
    weight: null,
    mood: null,
    energy: null,
    adherence: null,
    notes: null,
    sleep_hours: null,
    ...overrides,
  };
}

const TODAY = new Date("2026-08-01T12:00:00Z");

describe("checkinStreak", () => {
  it("counts consecutive days ending today", () => {
    const rows = ["2026-08-01", "2026-07-31", "2026-07-30"].map((d) => checkin({ checkin_date: d }));
    expect(checkinStreak(rows, TODAY)).toBe(3);
  });

  it("grants grace when today has no check-in yet but yesterday does", () => {
    const rows = ["2026-07-31", "2026-07-30"].map((d) => checkin({ checkin_date: d }));
    expect(checkinStreak(rows, TODAY)).toBe(2);
  });

  it("is zero when neither today nor yesterday has a check-in", () => {
    const rows = ["2026-07-29"].map((d) => checkin({ checkin_date: d }));
    expect(checkinStreak(rows, TODAY)).toBe(0);
  });

  it("stops at a gap instead of counting through it", () => {
    const rows = ["2026-08-01", "2026-07-31", "2026-07-28", "2026-07-27", "2026-07-26"].map((d) =>
      checkin({ checkin_date: d })
    );
    expect(checkinStreak(rows, TODAY)).toBe(2);
  });

  it("is zero for an empty history", () => {
    expect(checkinStreak([], TODAY)).toBe(0);
  });

  it("counts a duplicated date only once", () => {
    const rows = ["2026-08-01", "2026-08-01", "2026-07-31"].map((d) => checkin({ checkin_date: d }));
    expect(checkinStreak(rows, TODAY)).toBe(2);
  });

  it("steps correctly across a month boundary", () => {
    const rows = ["2026-08-01", "2026-07-31"].map((d) => checkin({ checkin_date: d }));
    expect(checkinStreak(rows, TODAY)).toBe(2);
  });
});

describe("adherenceAverage", () => {
  it("excludes null rows from the denominator instead of treating them as zero", () => {
    const rows = [80, null, 100].map((v) => checkin({ checkin_date: "2026-08-01", adherence: v }));
    expect(adherenceAverage(rows)).toBe(90);
  });

  it("is null when every row is null", () => {
    const rows = [null, null].map((v) => checkin({ checkin_date: "2026-08-01", adherence: v }));
    expect(adherenceAverage(rows)).toBeNull();
  });

  it("is null for an empty array", () => {
    expect(adherenceAverage([])).toBeNull();
  });

  it("rounds half-up", () => {
    const rows = [80, 85].map((v) => checkin({ checkin_date: "2026-08-01", adherence: v }));
    expect(adherenceAverage(rows)).toBe(83);
  });
});

describe("weightTrend", () => {
  it("reports the delta between the two latest readings", () => {
    const rows = [
      checkin({ checkin_date: "2026-07-25", weight: 82 }),
      checkin({ checkin_date: "2026-08-01", weight: 80.5 }),
    ];
    const trend = weightTrend(rows);
    expect(trend).toMatchObject({ latest: 80.5, previous: 82, date: "2026-08-01" });
    expect(trend!.delta).toBeCloseTo(-1.5);
  });

  it("skips a null weight and falls back to the last two non-null readings", () => {
    const rows = [
      checkin({ checkin_date: "2026-07-20", weight: 83 }),
      checkin({ checkin_date: "2026-07-27", weight: 82 }),
      checkin({ checkin_date: "2026-08-01", weight: null }),
    ];
    const trend = weightTrend(rows);
    expect(trend).toMatchObject({ latest: 82, previous: 83 });
  });

  it("has a zero delta with only one reading", () => {
    const rows = [checkin({ checkin_date: "2026-08-01", weight: 80 })];
    expect(weightTrend(rows)).toMatchObject({ latest: 80, previous: 80, delta: 0 });
  });

  it("is null with zero weight readings", () => {
    expect(weightTrend([checkin({ checkin_date: "2026-08-01" })])).toBeNull();
  });
});

describe("lastCheckinDate", () => {
  it("returns the most recent date regardless of input order", () => {
    const rows = ["2026-07-20", "2026-08-01", "2026-07-27"].map((d) => checkin({ checkin_date: d }));
    expect(lastCheckinDate(rows)).toBe("2026-08-01");
  });

  it("is null for an empty history", () => {
    expect(lastCheckinDate([])).toBeNull();
  });
});

describe("rangeStart", () => {
  it("computes an inclusive 7-day start", () => {
    expect(rangeStart("7d", new Date("2026-08-01T00:00:00Z"))).toBe("2026-07-26");
  });

  it("returns undefined for 'all'", () => {
    expect(rangeStart("all", TODAY)).toBeUndefined();
  });
});

describe("parseRange", () => {
  it("defaults unrecognized values to 30d", () => {
    expect(parseRange("garbage")).toBe("30d");
    expect(parseRange(undefined)).toBe("30d");
  });

  it("passes through valid values", () => {
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("all")).toBe("all");
  });
});
