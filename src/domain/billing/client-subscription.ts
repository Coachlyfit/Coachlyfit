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
