import { describe, expect, it } from "vitest";
import { backoffMinutes, nextDeliveryOutcome, MAX_ATTEMPTS } from "./delivery";

describe("backoffMinutes", () => {
  it("returns the schedule for attempts 1-3", () => {
    expect(backoffMinutes(1)).toBe(5);
    expect(backoffMinutes(2)).toBe(25);
  });

  it("clamps at the last entry for an attempt number beyond the schedule", () => {
    expect(backoffMinutes(0)).toBe(1);
    expect(backoffMinutes(99)).toBe(25);
  });
});

describe("nextDeliveryOutcome", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("schedules a retry with backoff when attempts remain", () => {
    const outcome = nextDeliveryOutcome(1, now);
    expect(outcome.status).toBe("retry");
    if (outcome.status === "retry") {
      expect(outcome.sendAfter.toISOString()).toBe("2026-01-01T00:01:00.000Z");
    }
  });

  it("uses the second backoff step on the second failed attempt", () => {
    const outcome = nextDeliveryOutcome(2, now);
    expect(outcome.status).toBe("retry");
    if (outcome.status === "retry") {
      expect(outcome.sendAfter.toISOString()).toBe("2026-01-01T00:05:00.000Z");
    }
  });

  it("marks dead once attempts reach MAX_ATTEMPTS", () => {
    expect(nextDeliveryOutcome(MAX_ATTEMPTS, now)).toEqual({ status: "dead" });
  });

  it("marks dead for any attempt count beyond MAX_ATTEMPTS too", () => {
    expect(nextDeliveryOutcome(MAX_ATTEMPTS + 5, now)).toEqual({ status: "dead" });
  });
});
