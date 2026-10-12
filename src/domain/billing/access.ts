import { REMINDER_DAYS, type SubscriptionStatus } from "./lifecycle";

/** Statuses that keep a coach's access. Mirrors private.coach_has_access()
 * (20261017000002_coach_access_guard.sql): past_due is the grace window. */
export const ACCESS_STATUSES: readonly SubscriptionStatus[] = ["trialing", "active", "past_due"];

const MS_PER_DAY = 86_400_000;

export type CoachAccess = {
  allowed: boolean;
  banner: "pastDue" | "trialEnding" | null;
  /** Whole days left on the trial, for the trialEnding banner. */
  days: number;
};

/** What the coach layout does with a subscription: let the coach in or send
 * them to the subscription page, and which warning to show. null = the coach
 * has no subscription row. The layout is UX only -- the database enforces the
 * same rule on writes. */
export function coachAccess(
  sub: { status: string; trial_ends_at: string | null } | null,
  now: Date
): CoachAccess {
  if (!sub || !(ACCESS_STATUSES as readonly string[]).includes(sub.status)) {
    return { allowed: false, banner: null, days: 0 };
  }
  if (sub.status === "past_due") return { allowed: true, banner: "pastDue", days: 0 };

  if (sub.status === "trialing" && sub.trial_ends_at) {
    const daysLeft = (new Date(sub.trial_ends_at).getTime() - now.getTime()) / MS_PER_DAY;
    if (daysLeft <= REMINDER_DAYS) {
      return { allowed: true, banner: "trialEnding", days: Math.max(0, Math.ceil(daysLeft)) };
    }
  }
  return { allowed: true, banner: null, days: 0 };
}
