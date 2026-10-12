import { describe, expect, it } from "vitest";
import { coachAccess } from "./access";

const NOW = new Date("2026-08-01T00:00:00Z");

describe("coachAccess", () => {
  it("blocks a coach with no subscription row", () => {
    expect(coachAccess(null, NOW)).toEqual({ allowed: false, banner: null, days: 0 });
  });

  it("blocks a canceled subscription", () => {
    expect(coachAccess({ status: "canceled", trial_ends_at: null }, NOW).allowed).toBe(false);
  });

  it("blocks a status it doesn't know", () => {
    expect(coachAccess({ status: "paused", trial_ends_at: null }, NOW).allowed).toBe(false);
  });

  it("lets an active subscription through with no banner", () => {
    expect(coachAccess({ status: "active", trial_ends_at: null }, NOW)).toEqual({ allowed: true, banner: null, days: 0 });
  });

  it("keeps access during the past_due grace period, with a banner", () => {
    expect(coachAccess({ status: "past_due", trial_ends_at: null }, NOW)).toEqual({
      allowed: true,
      banner: "pastDue",
      days: 0,
    });
  });

  it("warns when the trial ends within 3 days", () => {
    expect(coachAccess({ status: "trialing", trial_ends_at: "2026-08-03T12:00:00Z" }, NOW)).toEqual({
      allowed: true,
      banner: "trialEnding",
      days: 3,
    });
  });

  it("shows no banner for a trial with more than 3 days left", () => {
    expect(coachAccess({ status: "trialing", trial_ends_at: "2026-08-05T00:00:00Z" }, NOW).banner).toBeNull();
  });

  it("still warns (0 days) for a trial that ran out before the cron flipped it", () => {
    expect(coachAccess({ status: "trialing", trial_ends_at: "2026-07-31T00:00:00Z" }, NOW)).toEqual({
      allowed: true,
      banner: "trialEnding",
      days: 0,
    });
  });
});
