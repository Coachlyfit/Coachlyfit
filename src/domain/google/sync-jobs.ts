import { GoogleApiError } from "@/lib/google/errors";

export const MAX_SYNC_ATTEMPTS = 8;
const BASE_DELAY_MS = 30_000;

export type SyncOutcome = { status: "retry"; nextAttemptAt: Date } | { status: "dead" };

/** A request Google will keep refusing however often we repeat it. Rate
 * limits (403/429), timeouts and 5xx are not permanent. */
function isPermanent(error: unknown): boolean {
  if (!(error instanceof GoogleApiError)) return false;
  if (error.isRateLimit) return false;
  return error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 401;
}

/** Retry schedule for a failed sync job, like notification_deliveries but for
 * a flakier, rate-limited API: exponential from 30s (30s, 1m, 2m ... 32m over
 * 8 attempts, about an hour in all), +up to 10% jitter so a batch of failures
 * doesn't come back in lockstep, never sooner than Google's Retry-After, and a
 * permanent refusal goes straight to dead. No separate cap: the attempt limit
 * already bounds the delay. */
export function nextSyncOutcome(
  attemptsAfterThisTry: number,
  now: Date,
  error: unknown,
  random: () => number = Math.random
): SyncOutcome {
  if (attemptsAfterThisTry >= MAX_SYNC_ATTEMPTS || isPermanent(error)) return { status: "dead" };
  const exponential = BASE_DELAY_MS * 2 ** (attemptsAfterThisTry - 1);
  const withJitter = exponential * (1 + 0.1 * random());
  const retryAfter = error instanceof GoogleApiError ? (error.retryAfterMs ?? 0) : 0;
  return { status: "retry", nextAttemptAt: new Date(now.getTime() + Math.max(withJitter, retryAfter)) };
}

/** What lands in google_sync_jobs.last_error: the error's own message (Google's
 * status + reason, built in GoogleApiError), never a body, token or secret. */
export function describeError(error: unknown): string {
  if (error instanceof GoogleApiError) return error.message.slice(0, 500);
  return (error instanceof Error ? error.name : "UnknownError").slice(0, 100);
}
