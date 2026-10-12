import { describe, expect, it } from "vitest";
import { dueReminder, groupTransitions, nextStatus } from "./lifecycle";

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

  it("cancels at the deadline with no grace when the coach asked to cancel", () => {
    const sub = {
      status: "active" as const,
      trial_ends_at: null,
      current_period_end: "2026-07-31T00:00:00Z",
      cancel_at_period_end: true,
    };
    expect(nextStatus(sub, NOW)).toBe("canceled");
  });

  it("leaves a cancel-at-period-end subscription alone until the period ends", () => {
    const sub = {
      status: "active" as const,
      trial_ends_at: null,
      current_period_end: "2026-08-10T00:00:00Z",
      cancel_at_period_end: true,
    };
    expect(nextStatus(sub, NOW)).toBeNull();
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

describe("dueReminder", () => {
  it("reminds a trial ending within 3 days", () => {
    const sub = { status: "trialing" as const, trial_ends_at: "2026-08-03T00:00:00Z", current_period_end: null };
    expect(dueReminder(sub, NOW)).toEqual({ kind: "trial_ending", periodEnd: "2026-08-03T00:00:00Z" });
  });

  it("reminds an active subscription renewing within 3 days", () => {
    const sub = { status: "active" as const, trial_ends_at: null, current_period_end: "2026-08-04T00:00:00Z" };
    expect(dueReminder(sub, NOW)).toEqual({ kind: "renewal_due", periodEnd: "2026-08-04T00:00:00Z" });
  });

  it("stays quiet more than 3 days out", () => {
    const sub = { status: "active" as const, trial_ends_at: null, current_period_end: "2026-08-04T00:00:01Z" };
    expect(dueReminder(sub, NOW)).toBeNull();
  });

  it("stays quiet once the deadline has passed (that is the past_due notice's job)", () => {
    const sub = { status: "active" as const, trial_ends_at: null, current_period_end: "2026-08-01T00:00:00Z" };
    expect(dueReminder(sub, NOW)).toBeNull();
  });

  it("doesn't remind a coach who asked to cancel", () => {
    const sub = {
      status: "active" as const,
      trial_ends_at: null,
      current_period_end: "2026-08-02T00:00:00Z",
      cancel_at_period_end: true,
    };
    expect(dueReminder(sub, NOW)).toBeNull();
  });

  it("ignores past_due and canceled subscriptions", () => {
    const base = { trial_ends_at: null, current_period_end: "2026-08-02T00:00:00Z" };
    expect(dueReminder({ ...base, status: "past_due" }, NOW)).toBeNull();
    expect(dueReminder({ ...base, status: "canceled" }, NOW)).toBeNull();
  });
});

describe("groupTransitions", () => {
  it("groups by target status and keeps the lapsed deadline, skipping unchanged rows", () => {
    const subs = [
      { id: "a", status: "trialing" as const, trial_ends_at: "2026-07-30T00:00:00Z", current_period_end: null },
      { id: "b", status: "active" as const, trial_ends_at: null, current_period_end: "2026-07-31T00:00:00Z" },
      { id: "c", status: "past_due" as const, trial_ends_at: null, current_period_end: "2026-07-20T00:00:00Z" },
      { id: "d", status: "active" as const, trial_ends_at: null, current_period_end: "2026-09-01T00:00:00Z" },
    ];
    const groups = groupTransitions(subs, NOW);
    expect(groups.past_due?.map((t) => [t.sub.id, t.periodEnd])).toEqual([
      ["a", "2026-07-30T00:00:00Z"],
      ["b", "2026-07-31T00:00:00Z"],
    ]);
    expect(groups.canceled?.map((t) => t.sub.id)).toEqual(["c"]);
    expect(Object.keys(groups).sort()).toEqual(["canceled", "past_due"]);
  });
});
