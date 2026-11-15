import { describe, expect, it } from "vitest";
import { doneOn, workoutEntry } from "./session-entry";

const session = (over: Partial<{ program_day_id: string; started_at: string; completed_at: string | null }> = {}) => ({
  program_day_id: "push",
  started_at: "2026-11-15T10:00:00.000Z",
  completed_at: null,
  ...over,
});

describe("workoutEntry", () => {
  it("opening a card with nothing in progress is only a preview (no session)", () => {
    expect(workoutEntry({ programDayId: "pull", active: null, weekSession: null })).toEqual({ kind: "preview" });
  });

  it("a day already done this week still previews first, so a restart needs an explicit Start", () => {
    const done = session({ program_day_id: "pull", completed_at: "2026-11-14T11:00:00.000Z" });
    expect(workoutEntry({ programDayId: "pull", active: null, weekSession: done })).toEqual({ kind: "preview" });
  });

  it("an in-progress session on the same day opens the runner", () => {
    expect(workoutEntry({ programDayId: "push", active: session(), weekSession: session() })).toEqual({ kind: "runner" });
  });

  it("an in-progress session on another day redirects there: never two active sessions", () => {
    expect(workoutEntry({ programDayId: "pull", active: session(), weekSession: null })).toEqual({
      kind: "redirect",
      dayId: "push",
    });
  });

  it("view=summary on a completed day opens the runner in summary mode", () => {
    const done = session({ program_day_id: "pull", completed_at: "2026-11-14T11:00:00.000Z" });
    expect(workoutEntry({ programDayId: "pull", active: null, weekSession: done, view: "summary" })).toEqual({
      kind: "runner",
    });
  });
});

describe("doneOn", () => {
  it("is null when it was done on its scheduled date", () => {
    expect(doneOn({ started_at: "2026-11-15T08:00:00.000Z" }, "2026-11-15")).toBeNull();
  });

  it("returns the real date when a different day's workout was logged (Push done on Pull's Sunday)", () => {
    expect(doneOn({ started_at: "2026-11-15T08:00:00.000Z" }, "2026-11-16")).toBe("2026-11-15");
  });

  it("is null without a session", () => {
    expect(doneOn(undefined, "2026-11-15")).toBeNull();
  });
});
