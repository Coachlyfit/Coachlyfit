import { describe, expect, it } from "vitest";
import { daysUntilPermanentDelete } from "./deletion";

const now = new Date("2026-11-15T12:00:00Z");

describe("daysUntilPermanentDelete", () => {
  it("gives the full retention window right after deletion", () => {
    expect(daysUntilPermanentDelete("2026-11-15T12:00:00Z", now)).toBe(60);
  });

  it("rounds a partial day up", () => {
    expect(daysUntilPermanentDelete("2026-09-17T00:00:00Z", now)).toBe(1);
  });

  it("never goes negative once the window has passed", () => {
    expect(daysUntilPermanentDelete("2026-08-01T00:00:00Z", now)).toBe(0);
  });
});
