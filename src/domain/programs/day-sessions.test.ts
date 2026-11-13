import { describe, expect, it } from "vitest";
import { daysWithSessions, primaryDays, sessionsOf } from "./day-sessions";

const days = [
  { id: "a", parent_day_id: null },
  { id: "b" }, // a row that predates the column: no parent
  { id: "a-pm", parent_day_id: "a" },
  { id: "a-eve", parent_day_id: "a" },
  { id: "b-pm", parent_day_id: "b" },
];

describe("day sessions", () => {
  it("primary days are those that are not another day's session", () => {
    expect(primaryDays(days).map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("a day's sessions are the rows pointing at it, in stored order", () => {
    expect(sessionsOf(days, "a").map((d) => d.id)).toEqual(["a-pm", "a-eve"]);
    expect(sessionsOf(days, "b").map((d) => d.id)).toEqual(["b-pm"]);
    expect(sessionsOf(days, "a-pm")).toEqual([]);
  });

  it("reading order puts each day's sessions right after it", () => {
    expect(daysWithSessions(days).map((d) => d.id)).toEqual(["a", "a-pm", "a-eve", "b", "b-pm"]);
  });
});
