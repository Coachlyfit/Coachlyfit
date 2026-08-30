import { describe, expect, it } from "vitest";
import { shouldTriggerCheckin } from "./lifecycle";

const NOW = new Date("2026-08-20T00:00:00Z");

describe("shouldTriggerCheckin", () => {
  it("triggers once a program's end_date has passed and no check-in has been sent yet", () => {
    const program = { end_date: "2026-08-19", checkin_triggered_at: null };
    expect(shouldTriggerCheckin(program, NOW)).toBe(true);
  });

  it("triggers on the end_date itself, not only strictly after it", () => {
    const program = { end_date: "2026-08-20", checkin_triggered_at: null };
    expect(shouldTriggerCheckin(program, NOW)).toBe(true);
  });

  it("does not trigger while the program is still running", () => {
    const program = { end_date: "2026-08-21", checkin_triggered_at: null };
    expect(shouldTriggerCheckin(program, NOW)).toBe(false);
  });

  it("does not trigger a second time once already sent, even if still expired", () => {
    const program = { end_date: "2026-08-01", checkin_triggered_at: "2026-08-15T00:00:00Z" };
    expect(shouldTriggerCheckin(program, NOW)).toBe(false);
  });

  it("does not trigger for an open-ended program with no end_date", () => {
    const program = { end_date: null, checkin_triggered_at: null };
    expect(shouldTriggerCheckin(program, NOW)).toBe(false);
  });
});
