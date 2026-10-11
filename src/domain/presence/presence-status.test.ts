import { describe, expect, it } from "vitest";
import { INACTIVE_AFTER_DAYS, presenceStatus } from "./presence-status";

const NOW = new Date("2026-10-11T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe("presenceStatus", () => {
  it("is online whenever the user is present, whatever last_seen_at says", () => {
    expect(presenceStatus(true, null, NOW)).toBe("online");
    expect(presenceStatus(true, daysAgo(40), NOW)).toBe("online");
  });

  it("is never when there is no last seen at all", () => {
    expect(presenceStatus(false, null, NOW)).toBe("never");
  });

  it("turns inactive only after INACTIVE_AFTER_DAYS", () => {
    expect(presenceStatus(false, daysAgo(0.1), NOW)).toBe("offline");
    expect(presenceStatus(false, daysAgo(INACTIVE_AFTER_DAYS), NOW)).toBe("offline");
    expect(presenceStatus(false, daysAgo(INACTIVE_AFTER_DAYS + 0.01), NOW)).toBe("inactive");
  });
});
