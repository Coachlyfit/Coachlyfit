import { describe, expect, it, vi, afterEach } from "vitest";
import { formatRelativeTime } from "./format";

describe("formatRelativeTime", () => {
  const NOW = new Date("2026-09-13T12:00:00Z");

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 'now' for anything under a minute old", () => {
    vi.useFakeTimers().setSystemTime(NOW);
    const thirtySecondsAgo = new Date(NOW.getTime() - 30_000).toISOString();
    expect(formatRelativeTime(thirtySecondsAgo, "en")).toMatch(/now/i);
  });

  it("reports minutes for a message a few minutes old", () => {
    vi.useFakeTimers().setSystemTime(NOW);
    const fiveMinAgo = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMinAgo, "en")).toMatch(/5 minutes ago/);
  });

  it("reports hours for a message hours old", () => {
    vi.useFakeTimers().setSystemTime(NOW);
    const threeHoursAgo = new Date(NOW.getTime() - 3 * 3_600_000).toISOString();
    expect(formatRelativeTime(threeHoursAgo, "en")).toMatch(/3 hours ago/);
  });

  it("reports days for a message a couple days old", () => {
    vi.useFakeTimers().setSystemTime(NOW);
    const twoDaysAgo = new Date(NOW.getTime() - 2 * 86_400_000).toISOString();
    expect(formatRelativeTime(twoDaysAgo, "en")).toMatch(/2 days ago/);
  });

  it("falls back to a short date past a week", () => {
    vi.useFakeTimers().setSystemTime(NOW);
    const tenDaysAgo = new Date(NOW.getTime() - 10 * 86_400_000).toISOString();
    const result = formatRelativeTime(tenDaysAgo, "en");
    expect(result).not.toMatch(/ago/);
  });
});
