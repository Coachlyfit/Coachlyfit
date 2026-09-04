/** Pure retry policy for notification_deliveries — how many attempts before
 * giving up, and how long to wait before the next one. Kept separate from
 * the cron route so the backoff schedule is unit-testable without a live
 * Resend call or a Postgres connection. */

export const MAX_ATTEMPTS = 3;

// 1min, 5min, 25min — short enough that a transient provider blip
// (rate limit, momentary 5xx) recovers within the same 5-minute cron
// cadence or the next one, without hammering the provider on every tick.
const BACKOFF_MINUTES = [1, 5, 25];

export function backoffMinutes(attemptNumber: number): number {
  return BACKOFF_MINUTES[Math.min(attemptNumber, BACKOFF_MINUTES.length - 1)];
}

export type DeliveryOutcome =
  | { status: "sent" }
  | { status: "retry"; sendAfter: Date }
  | { status: "dead" };

/** What a delivery row's next state should be after a send attempt fails,
 * given the attempt count it will have AFTER this failure (i.e. call with
 * attempts + 1). Success is handled directly by the caller (status: "sent",
 * no backoff math needed) — this only covers the failure branch. */
export function nextDeliveryOutcome(attemptsAfterThisTry: number, now: Date): DeliveryOutcome {
  if (attemptsAfterThisTry >= MAX_ATTEMPTS) return { status: "dead" };
  const minutes = backoffMinutes(attemptsAfterThisTry - 1);
  return { status: "retry", sendAfter: new Date(now.getTime() + minutes * 60_000) };
}
