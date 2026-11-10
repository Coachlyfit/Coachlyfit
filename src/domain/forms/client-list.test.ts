import { describe, expect, it } from "vitest";
import {
  compareTodo,
  draftProgress,
  dueStatus,
  estimateTime,
  streakDays,
  streakLength,
} from "./client-list";
import type { FormField } from "./schema";

const NOW = new Date("2026-11-10T10:00:00Z"); // 12:00 in Cairo

function field(overrides: Partial<FormField>): FormField {
  return { id: "f", type: "text", label: { ar: "ح", en: "F" }, required: false, ...overrides } as FormField;
}

describe("estimateTime", () => {
  it("is under a minute for a few questions, then rounds minutes", () => {
    expect(estimateTime(2)).toEqual({ kind: "underMinute" });
    expect(estimateTime(5)).toEqual({ kind: "minutes", minutes: 2 });
    expect(estimateTime(10)).toEqual({ kind: "minutes", minutes: 4 });
  });
});

describe("dueStatus", () => {
  it("handles none / today / upcoming / overdue by calendar day", () => {
    expect(dueStatus(null, NOW)).toEqual({ kind: "none" });
    expect(dueStatus("2026-11-10T01:00:00Z", NOW)).toEqual({ kind: "today" });
    expect(dueStatus("2026-11-12T10:00:00Z", NOW)).toEqual({ kind: "upcoming", days: 2 });
    expect(dueStatus("2026-11-08T10:00:00Z", NOW)).toEqual({ kind: "overdue", days: 2 });
  });

  it("uses the Cairo day, not the UTC day", () => {
    // 22:30 UTC on the 9th is already the 10th in Cairo.
    expect(dueStatus("2026-11-09T22:30:00Z", NOW)).toEqual({ kind: "today" });
  });
});

describe("compareTodo", () => {
  it("orders by due date, undated last, newest assignment as tie-break", () => {
    const rows = [
      { id: "none-old", due_at: null, assigned_at: "2026-11-01T00:00:00Z" },
      { id: "late", due_at: "2026-11-08T00:00:00Z", assigned_at: "2026-11-01T00:00:00Z" },
      { id: "soon", due_at: "2026-11-11T00:00:00Z", assigned_at: "2026-11-01T00:00:00Z" },
      { id: "none-new", due_at: null, assigned_at: "2026-11-05T00:00:00Z" },
    ];
    expect(rows.sort(compareTodo).map((r) => r.id)).toEqual(["late", "soon", "none-new", "none-old"]);
  });
});

describe("draftProgress", () => {
  it("counts answered visible questions only", () => {
    const fields = [field({ id: "a" }), field({ id: "b" }), field({ id: "s", type: "section" })];
    expect(draftProgress(fields, { a: "x" })).toBe(0.5);
    expect(draftProgress(fields, { a: "x", b: [] })).toBe(0.5);
    expect(draftProgress([], {})).toBe(0);
  });
});

describe("streak", () => {
  const at = (iso: string) => iso;
  it("is hidden for a one-off form", () => {
    expect(streakDays([at("2026-11-10T08:00:00Z")], NOW)).toBeNull();
  });

  it("marks the days submitted within the last 7, today last", () => {
    const days = streakDays([at("2026-11-10T08:00:00Z"), at("2026-11-08T08:00:00Z"), at("2026-11-01T08:00:00Z")], NOW);
    expect(days).toEqual([false, false, false, false, true, false, true]);
  });

  it("counts consecutive days, still alive until end of today", () => {
    expect(streakLength([at("2026-11-09T08:00:00Z"), at("2026-11-08T08:00:00Z")], NOW)).toBe(2);
    expect(streakLength([at("2026-11-10T08:00:00Z"), at("2026-11-08T08:00:00Z")], NOW)).toBe(1);
    expect(streakLength([], NOW)).toBe(0);
  });
});
