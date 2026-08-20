import { describe, expect, it } from "vitest";
import { nextStatus } from "./lifecycle";

const NOW = new Date("2026-08-01T00:00:00Z");

describe("nextStatus", () => {
  it("makes no change while a trial is still current", () => {
    const sub = { status: "trialing" as const, trial_ends_at: "2026-08-02T00:00:00Z", current_period_end: null };
    expect(nextStatus(sub, NOW)).toBeNull();
  });

  it("moves an expired trial to past_due, not straight to canceled", () => {
    const sub = { status: "trialing" as const, trial_ends_at: "2026-07-30T00:00:00Z", current_period_end: null };
    expect(nextStatus(sub, NOW)).toBe("past_due");
  });

  it("moves an active subscription past its period end to past_due", () => {
    const sub = { status: "active" as const, trial_ends_at: null, current_period_end: "2026-07-31T00:00:00Z" };
    expect(nextStatus(sub, NOW)).toBe("past_due");
  });

  it("leaves an already past_due subscription alone within the grace period", () => {
    const sub = { status: "past_due" as const, trial_ends_at: null, current_period_end: "2026-07-28T00:00:00Z" };
    expect(nextStatus(sub, NOW)).toBeNull(); // 4 days overdue, grace is 7
  });

  it("cancels once the grace period (7 days) has fully elapsed", () => {
    const sub = { status: "past_due" as const, trial_ends_at: null, current_period_end: "2026-07-24T00:00:00Z" };
    expect(nextStatus(sub, NOW)).toBe("canceled");
  });

  it("cancels directly from active if it's been overdue 7+ days without an intermediate check", () => {
    const sub = { status: "active" as const, trial_ends_at: null, current_period_end: "2026-07-20T00:00:00Z" };
    expect(nextStatus(sub, NOW)).toBe("canceled");
  });

  it("never revives a canceled subscription", () => {
    const sub = { status: "canceled" as const, trial_ends_at: null, current_period_end: "2020-01-01T00:00:00Z" };
    expect(nextStatus(sub, NOW)).toBeNull();
  });

  it("makes no change when there's no deadline to measure against", () => {
    const sub = { status: "active" as const, trial_ends_at: null, current_period_end: null };
    expect(nextStatus(sub, NOW)).toBeNull();
  });
});
