import { describe, expect, it } from "vitest";
import { groupByDay } from "./audit";

describe("groupByDay", () => {
  // 2026-10-12 09:00 UTC = 12:00 in Cairo (UTC+3 in October).
  const now = new Date("2026-10-12T09:00:00Z");

  it("labels today and yesterday by Cairo calendar day and keeps order", () => {
    const groups = groupByDay(
      [
        { id: "a", created_at: "2026-10-12T08:00:00Z" },
        // 21:30 UTC on the 11th is already 00:30 on the 12th in Cairo.
        { id: "b", created_at: "2026-10-11T21:30:00Z" },
        { id: "c", created_at: "2026-10-11T10:00:00Z" },
        { id: "d", created_at: "2026-10-01T10:00:00Z" },
      ],
      now
    );

    expect(groups.map((g) => [g.day, g.kind, g.items.map((i) => i.id)])).toEqual([
      ["2026-10-12", "today", ["a", "b"]],
      ["2026-10-11", "yesterday", ["c"]],
      ["2026-10-01", "date", ["d"]],
    ]);
  });

  it("returns nothing for no entries", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});
