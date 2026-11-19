import { describe, expect, it } from "vitest";
import { adherenceInWindow, heroModel, weeksBetween, weightDelta, type ShareCheckin } from "./share-stats";

const c = (checkin_date: string, weight: number | null, adherence: number | null = null): ShareCheckin => ({
  checkin_date,
  weight,
  adherence,
});

describe("weeksBetween", () => {
  it("rounds to whole weeks", () => {
    expect(weeksBetween("2026-01-01T00:00:00Z", "2026-03-26T00:00:00Z")).toBe(12);
  });
  it("never goes below 1", () => {
    expect(weeksBetween("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")).toBe(1);
  });
});

describe("weightDelta", () => {
  const rows = [c("2025-12-30", 99), c("2026-01-02", 90), c("2026-02-01", 86), c("2026-03-20", 81.6), c("2026-04-10", 70)];
  it("uses first and last weight inside the window only", () => {
    expect(weightDelta(rows, "2026-01-01T10:00:00Z", "2026-03-25T10:00:00Z")).toBe(-8.4);
  });
  it("is null with fewer than two readings", () => {
    expect(weightDelta(rows, "2026-03-19T00:00:00Z", "2026-03-30T00:00:00Z")).toBeNull();
    expect(weightDelta([c("2026-01-02", null), c("2026-01-03", 80)], "2026-01-01", "2026-01-31")).toBeNull();
  });
});

describe("adherenceInWindow", () => {
  it("averages inside the window and ignores nulls", () => {
    const rows = [c("2026-01-02", 1, 80), c("2026-01-03", 1, null), c("2026-01-04", 1, 100), c("2026-05-01", 1, 0)];
    expect(adherenceInWindow(rows, "2026-01-01", "2026-02-01")).toBe(90);
  });
  it("is null when nothing recorded", () => {
    expect(adherenceInWindow([c("2026-01-02", 1, null)], "2026-01-01", "2026-02-01")).toBeNull();
  });
});

describe("heroModel", () => {
  it("prefers weight when on and known", () => {
    expect(heroModel({ showWeight: true, showDuration: true, delta: -8.4, weeks: 12 })).toEqual({
      kind: "weight",
      delta: -8.4,
      withDuration: true,
    });
  });
  it("falls back to duration when weight is hidden or unknown", () => {
    expect(heroModel({ showWeight: false, showDuration: true, delta: -8.4, weeks: 12 })).toEqual({ kind: "duration", weeks: 12 });
    expect(heroModel({ showWeight: true, showDuration: true, delta: null, weeks: 12 })).toEqual({ kind: "duration", weeks: 12 });
  });
  it("falls back to a plain report when nothing is shown", () => {
    expect(heroModel({ showWeight: false, showDuration: false, delta: null, weeks: 12 })).toEqual({ kind: "report" });
  });
});
