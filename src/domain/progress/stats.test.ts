import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import {
  adherenceAverage,
  checkinStreak,
  isClientLate,
  lastCheckinDate,
  longestStreak,
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
    reviewed_at: null,
    reviewed_by: null,
    decision: null,
    adjustments: null,
    adjustment_applied_at: null,
    coach_reply: null,
    coach_seen_at: null,
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

describe("longestStreak", () => {
  it("finds the longest run even if it isn't the most recent one", () => {
    // 3-day run (07-01..07-03), gap, 2-day run (07-10..07-11) — the current
    // streak (2) is shorter than the best-ever streak (3) further back.
    const rows = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-10", "2026-07-11"].map((d) =>
      checkin({ checkin_date: d })
    );
    expect(longestStreak(rows)).toBe(3);
  });

  it("is zero for an empty history", () => {
    expect(longestStreak([])).toBe(0);
  });

  it("is 1 for a single check-in", () => {
    expect(longestStreak([checkin({ checkin_date: "2026-07-01" })])).toBe(1);
  });

  it("counts a duplicated date only once toward the run", () => {
    const rows = ["2026-07-01", "2026-07-01", "2026-07-02"].map((d) => checkin({ checkin_date: d }));
    expect(longestStreak(rows)).toBe(2);
  });

  it("does not require sorted input", () => {
    const rows = ["2026-07-03", "2026-07-01", "2026-07-02"].map((d) => checkin({ checkin_date: d }));
    expect(longestStreak(rows)).toBe(3);
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

describe("isClientLate", () => {
  const today = new Date("2026-08-15T00:00:00Z");

  it("is never late when invited or archived, regardless of check-in history", () => {
    expect(isClientLate("invited", null, today)).toBe(false);
    expect(isClientLate("archived", "2020-01-01", today)).toBe(false);
  });

  it("is late when active with no check-in at all", () => {
    expect(isClientLate("active", null, today)).toBe(true);
  });

  it("is late when active and the last check-in is more than 7 days old", () => {
    expect(isClientLate("active", "2026-08-07", today)).toBe(true);
  });

  it("is not late when active and checked in within 7 days", () => {
    expect(isClientLate("active", "2026-08-09", today)).toBe(false);
  });
});
