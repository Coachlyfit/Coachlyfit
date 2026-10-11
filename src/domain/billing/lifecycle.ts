export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export type SubscriptionLike = {
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  /** The coach asked to stop at the end of the period: no grace window. */
  cancel_at_period_end?: boolean;
};

const GRACE_PERIOD_DAYS = 7;
const MS_PER_DAY = 86_400_000;

/** Pure decision function for the daily cron lifecycle route — no DB, no
 * Next.js, just "given this subscription and the current time, what should
 * its status become?" (null = no change). Kept separate from the route so
 * the actual overdue-day-counting logic is unit-testable without a
 * database. */
export function nextStatus(sub: SubscriptionLike, now: Date): SubscriptionStatus | null {
  if (sub.status === "canceled") return null;

  const deadline = sub.status === "trialing" ? sub.trial_ends_at : sub.current_period_end;
  if (!deadline) return null;

  const daysOverdue = (now.getTime() - new Date(deadline).getTime()) / MS_PER_DAY;
  if (daysOverdue < 0) return null; // still within the current period/trial

  if (sub.cancel_at_period_end || daysOverdue >= GRACE_PERIOD_DAYS) return "canceled";
  return sub.status === "past_due" ? null : "past_due";
}
