import { describe, expect, it } from "vitest";
import { subscriptionDisplayStatus } from "./client-subscription";

const NOW = new Date("2026-08-22T00:00:00Z");

describe("subscriptionDisplayStatus", () => {
  it("is active while end_date is still ahead", () => {
    expect(subscriptionDisplayStatus({ status: "active", end_date: "2026-08-25" }, NOW)).toBe("active");
  });

  it("is still active on end_date itself — valid through the whole day", () => {
    expect(subscriptionDisplayStatus({ status: "active", end_date: "2026-08-22" }, NOW)).toBe("active");
  });

  it("becomes expired the day after end_date", () => {
    expect(subscriptionDisplayStatus({ status: "active", end_date: "2026-08-21" }, NOW)).toBe("expired");
  });

  it("reports frozen even if end_date has also passed — freeze is the explicit, overriding state", () => {
    expect(subscriptionDisplayStatus({ status: "frozen", end_date: "2026-08-01" }, NOW)).toBe("frozen");
  });

  it("reports canceled even while end_date is still ahead", () => {
    expect(subscriptionDisplayStatus({ status: "canceled", end_date: "2026-08-25" }, NOW)).toBe("canceled");
  });
});
