// The `checkins.adherence` column stays 0-100 (existing coach-dashboard
// stats untouched, see 20260802000001_workout_sessions_and_messages.sql).
// Both the classic CheckinForm and the check-in wizard show a 1-10 tap
// scale as a UI affordance over that same range, in steps of 10 — these
// two conversions are the only non-trivial logic in the wizard, so they
// get pulled out here to be Vitest-testable rather than living inline in
// the component.

export function adherenceToDb(scaleValue: number): number {
  return scaleValue * 10;
}

export function adherenceFromDb(dbValue: number): number {
  return Math.round(dbValue / 10);
}
