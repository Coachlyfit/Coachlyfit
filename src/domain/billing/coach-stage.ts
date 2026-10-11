/** Where a coach sits in the platform-subscription lifecycle, as the admin
 * home shows it. Derived from the subscription row only -- no DB, no Next.js,
 * so the day math is unit-testable (same split as lifecycle.ts). */
export type CoachStage = "trial" | "active" | "pastDue" | "cancelled";

export const COACH_STAGES: readonly CoachStage[] = ["trial", "active", "pastDue", "cancelled"];

export const TRIAL_ENDING_SOON_DAYS = 7;
/** An active coach unseen for this long gets a "check in on them" nudge. */
export const INACTIVE_AFTER_DAYS = 10;

const MS_PER_DAY = 86_400_000;

export type CoachSubscription = {
  status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  status_changed_at: string | null;
  last_seen_at: string | null;
};

export type CoachNote = {
  kind: "trialEnds" | "overdue" | "renews" | "inactive" | "cancelledAgo";
  days: number;
};

const STAGE_BY_STATUS: Record<string, CoachStage> = {
  trialing: "trial",
  active: "active",
  past_due: "pastDue",
  canceled: "cancelled",
};

/** null = the coach has no subscription row at all. */
export function coachStage(status: string | null): CoachStage | null {
  return (status && STAGE_BY_STATUS[status]) || null;
}

function daysUntil(iso: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / MS_PER_DAY));
}

function daysSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / MS_PER_DAY));
}

/** The one relative line shown under a coach ("3 days overdue", "trial ends
 * in 3 days"). null when the dates needed for it aren't recorded. */
export function coachNote(sub: CoachSubscription, now: Date): CoachNote | null {
  switch (coachStage(sub.status)) {
    case "trial":
      return sub.trial_ends_at ? { kind: "trialEnds", days: daysUntil(sub.trial_ends_at, now) } : null;
    case "pastDue": {
      const deadline = sub.current_period_end ?? sub.trial_ends_at;
      return deadline ? { kind: "overdue", days: daysSince(deadline, now) } : null;
    }
    case "active": {
      if (sub.last_seen_at && daysSince(sub.last_seen_at, now) >= INACTIVE_AFTER_DAYS) {
        return { kind: "inactive", days: daysSince(sub.last_seen_at, now) };
      }
      return sub.current_period_end ? { kind: "renews", days: daysUntil(sub.current_period_end, now) } : null;
    }
    case "cancelled":
      return sub.status_changed_at ? { kind: "cancelledAgo", days: daysSince(sub.status_changed_at, now) } : null;
    default:
      return null;
  }
}

/** Past due, or a trial about to run out. */
export function needsAttention(sub: CoachSubscription, now: Date): boolean {
  const stage = coachStage(sub.status);
  if (stage === "pastDue") return true;
  if (stage !== "trial" || !sub.trial_ends_at) return false;
  return daysUntil(sub.trial_ends_at, now) <= TRIAL_ENDING_SOON_DAYS;
}
