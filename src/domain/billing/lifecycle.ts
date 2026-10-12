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

/** A trial or a period ending within this many days gets a reminder email
 * from the cron and a banner in the app (see access.ts). */
export const REMINDER_DAYS = 3;

export type NoticeKind = "trial_ending" | "renewal_due" | "past_due" | "canceled";

/** The deadline a subscription is currently measured against. */
function deadlineOf(sub: SubscriptionLike): string | null {
  return sub.status === "trialing" ? sub.trial_ends_at : sub.current_period_end;
}

/** The "ends soon" reminder a subscription is due, if any: its trial or paid
 * period ends within REMINDER_DAYS and hasn't ended yet. A coach who already
 * asked to cancel isn't reminded to renew. The cron runs daily and the notice
 * is recorded per period, so a window (not "exactly 3 days") survives a
 * skipped run without sending twice. */
export function dueReminder(sub: SubscriptionLike, now: Date): { kind: NoticeKind; periodEnd: string } | null {
  if (sub.status !== "trialing" && sub.status !== "active") return null;
  if (sub.cancel_at_period_end) return null;

  const deadline = deadlineOf(sub);
  if (!deadline) return null;

  const daysLeft = (new Date(deadline).getTime() - now.getTime()) / MS_PER_DAY;
  if (daysLeft <= 0 || daysLeft > REMINDER_DAYS) return null;
  return { kind: sub.status === "trialing" ? "trial_ending" : "renewal_due", periodEnd: deadline };
}

export type Transition<T> = { sub: T; next: SubscriptionStatus; periodEnd: string };

/** Every subscription whose status has to change, grouped by the status it
 * moves to, so the cron can write one update per group. periodEnd is the
 * deadline that lapsed -- the key its notice is recorded under. */
export function groupTransitions<T extends SubscriptionLike>(
  subs: T[],
  now: Date
): Partial<Record<SubscriptionStatus, Transition<T>[]>> {
  const groups: Partial<Record<SubscriptionStatus, Transition<T>[]>> = {};
  for (const sub of subs) {
    const next = nextStatus(sub, now);
    const periodEnd = deadlineOf(sub);
    if (!next || !periodEnd) continue;
    (groups[next] ??= []).push({ sub, next, periodEnd });
  }
  return groups;
}
