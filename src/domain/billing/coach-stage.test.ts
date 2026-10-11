import { describe, expect, it } from "vitest";
import { coachNote, coachStage, needsAttention, type CoachSubscription } from "./coach-stage";

const NOW = new Date("2026-10-11T12:00:00Z");

function sub(overrides: Partial<CoachSubscription>): CoachSubscription {
  return {
    status: "active",
    trial_ends_at: null,
    current_period_end: null,
    status_changed_at: null,
    last_seen_at: null,
    ...overrides,
  };
}

describe("coachStage", () => {
  it("maps every subscription status to its stage", () => {
    expect(coachStage("trialing")).toBe("trial");
    expect(coachStage("active")).toBe("active");
    expect(coachStage("past_due")).toBe("pastDue");
    expect(coachStage("canceled")).toBe("cancelled");
  });

  it("returns null for a coach with no subscription or an unknown status", () => {
    expect(coachStage(null)).toBeNull();
    expect(coachStage("paused")).toBeNull();
  });
});

describe("coachNote", () => {
  it("counts whole days left on a trial", () => {
    expect(coachNote(sub({ status: "trialing", trial_ends_at: "2026-10-14T00:00:00Z" }), NOW)).toEqual({
      kind: "trialEnds",
      days: 3,
    });
  });

  it("counts days overdue from the period end", () => {
    expect(coachNote(sub({ status: "past_due", current_period_end: "2026-10-01T00:00:00Z" }), NOW)).toEqual({
      kind: "overdue",
      days: 10,
    });
  });

  it("falls back to the trial end for a lapsed trial with no period end", () => {
    expect(coachNote(sub({ status: "past_due", trial_ends_at: "2026-10-08T12:00:00Z" }), NOW)).toEqual({
      kind: "overdue",
      days: 3,
    });
  });

  it("shows the renewal countdown for an active coach seen recently", () => {
    const note = coachNote(
      sub({ current_period_end: "2026-11-01T00:00:00Z", last_seen_at: "2026-10-10T00:00:00Z" }),
      NOW
    );
    expect(note).toEqual({ kind: "renews", days: 21 });
  });

  it("flags an active coach unseen for 10+ days instead of the renewal date", () => {
    const note = coachNote(
      sub({ current_period_end: "2026-11-01T00:00:00Z", last_seen_at: "2026-09-29T00:00:00Z" }),
      NOW
    );
    expect(note).toEqual({ kind: "inactive", days: 12 });
  });

  it("only says when a coach cancelled if that date was recorded", () => {
    expect(coachNote(sub({ status: "canceled" }), NOW)).toBeNull();
    expect(coachNote(sub({ status: "canceled", status_changed_at: "2026-09-15T12:00:00Z" }), NOW)).toEqual({
      kind: "cancelledAgo",
      days: 26,
    });
  });
});

describe("needsAttention", () => {
  it("is true for every past-due coach", () => {
    expect(needsAttention(sub({ status: "past_due" }), NOW)).toBe(true);
  });

  it("is true for a trial ending within 7 days, false on day 8", () => {
    expect(needsAttention(sub({ status: "trialing", trial_ends_at: "2026-10-18T12:00:00Z" }), NOW)).toBe(true);
    expect(needsAttention(sub({ status: "trialing", trial_ends_at: "2026-10-19T12:00:00Z" }), NOW)).toBe(false);
  });

  it("is false for active and cancelled coaches", () => {
    expect(needsAttention(sub({ status: "active" }), NOW)).toBe(false);
    expect(needsAttention(sub({ status: "canceled" }), NOW)).toBe(false);
  });
});
