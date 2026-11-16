import { describe, expect, it } from "vitest";
import { GoogleApiError } from "@/lib/google/errors";
import { describeError, MAX_SYNC_ATTEMPTS, nextSyncOutcome } from "./sync-jobs";

const NOW = new Date("2026-01-18T10:00:00Z");
const noJitter = () => 0;
const delayMs = (outcome: ReturnType<typeof nextSyncOutcome>) =>
  outcome.status === "retry" ? outcome.nextAttemptAt.getTime() - NOW.getTime() : NaN;

describe("nextSyncOutcome", () => {
  it("backs off exponentially from 30s", () => {
    const err = new GoogleApiError(503, "backendError");
    expect([1, 2, 3, 4].map((n) => delayMs(nextSyncOutcome(n, NOW, err, noJitter)))).toEqual([30_000, 60_000, 120_000, 240_000]);
  });

  it("tops out at 32 minutes on the last retry, and adds at most 10% jitter", () => {
    const err = new GoogleApiError(503, "backendError");
    expect(delayMs(nextSyncOutcome(MAX_SYNC_ATTEMPTS - 1, NOW, err, noJitter))).toBe(32 * 60_000);
    expect(delayMs(nextSyncOutcome(1, NOW, err, () => 1))).toBeCloseTo(33_000, -1);
  });

  it("treats 403 rate limits and 429 as retryable, and honours Retry-After", () => {
    for (const err of [new GoogleApiError(403, "rateLimitExceeded"), new GoogleApiError(403, "userRateLimitExceeded"), new GoogleApiError(429, "unknown")]) {
      expect(nextSyncOutcome(1, NOW, err, noJitter).status).toBe("retry");
    }
    const slow = new GoogleApiError(429, "rateLimitExceeded", 10 * 60_000);
    expect(delayMs(nextSyncOutcome(1, NOW, slow, noJitter))).toBe(10 * 60_000);
  });

  it("retries network failures and 5xx; a permanent 4xx goes dead at once", () => {
    expect(nextSyncOutcome(1, NOW, new TypeError("fetch failed"), noJitter).status).toBe("retry");
    expect(nextSyncOutcome(1, NOW, new GoogleApiError(500, "backendError"), noJitter).status).toBe("retry");
    expect(nextSyncOutcome(1, NOW, new GoogleApiError(400, "invalid"), noJitter).status).toBe("dead");
    expect(nextSyncOutcome(1, NOW, new GoogleApiError(403, "forbidden"), noJitter).status).toBe("dead");
  });

  it("gives up after the maximum attempts", () => {
    const err = new GoogleApiError(503, "backendError");
    expect(nextSyncOutcome(MAX_SYNC_ATTEMPTS - 1, NOW, err, noJitter).status).toBe("retry");
    expect(nextSyncOutcome(MAX_SYNC_ATTEMPTS, NOW, err, noJitter).status).toBe("dead");
  });
});

describe("describeError", () => {
  it("keeps Google's status + reason and nothing else", () => {
    expect(describeError(new GoogleApiError(403, "rateLimitExceeded"))).toBe("Google API error 403 rateLimitExceeded");
    expect(describeError(new Error("Bearer ya29.secret-token leaked in a message"))).toBe("Error");
  });
});
