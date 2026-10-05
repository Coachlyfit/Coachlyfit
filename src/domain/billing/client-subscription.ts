export type ClientSubscriptionStatus = "active" | "frozen" | "canceled";
export type SubscriptionDisplayStatus = ClientSubscriptionStatus | "expired";

/** "Expired" is derived here, not stored — see the migration comment. A
 * frozen or canceled subscription reports that status regardless of
 * end_date: freeze/cancel are explicit coach actions that should keep
 * showing until the coach explicitly changes them, not get silently
 * relabeled "expired" by the calendar. Valid through end_date itself
 * (inclusive) — expires the day after, mirroring shouldTriggerCheckin's
 * "inclusive of the day" choice in programs/lifecycle.ts. */
export function subscriptionDisplayStatus(
  sub: { status: ClientSubscriptionStatus; end_date: string },
  now: Date
): SubscriptionDisplayStatus {
  if (sub.status !== "active") return sub.status;
  const endOfDay = new Date(`${sub.end_date}T23:59:59.999Z`);
  return endOfDay.getTime() < now.getTime() ? "expired" : "active";
}

export const RENEWS_SOON_DAYS = 7;

export type SubscriptionRosterStatus = SubscriptionDisplayStatus | "renewsSoon" | "none";

/** The roster's subscription badge: subscriptionDisplayStatus plus "none"
 * (no subscription row) and "renewsSoon" (active, ending within
 * RENEWS_SOON_DAYS). There is no paid/unpaid state on a subscription --
 * that lives on invoices -- so this never claims one. */
export function subscriptionRosterStatus(
  sub: { status: ClientSubscriptionStatus; end_date: string } | null,
  now: Date
): SubscriptionRosterStatus {
  if (!sub) return "none";
  const status = subscriptionDisplayStatus(sub, now);
  if (status !== "active") return status;
  const soon = new Date(now.getTime() + RENEWS_SOON_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return sub.end_date <= soon ? "renewsSoon" : "active";
}
