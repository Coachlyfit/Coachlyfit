export type CheckinTriggerLike = { end_date: string | null; checkin_triggered_at: string | null };

/** Pure decision function for the daily cron lifecycle route — mirrors
 * billing/lifecycle.ts's nextStatus: no DB, no Next.js, just "given this
 * program and the current time, should its auto check-in fire today?"
 * `checkin_triggered_at` is the idempotency marker (set once the cron has
 * actually created the form_assignments row) — once set, this returns false
 * forever, same as nextStatus never reviving a canceled subscription. */
export function shouldTriggerCheckin(program: CheckinTriggerLike, now: Date): boolean {
  if (program.checkin_triggered_at != null) return false;
  if (!program.end_date) return false;
  return new Date(`${program.end_date}T00:00:00Z`).getTime() <= now.getTime();
}
