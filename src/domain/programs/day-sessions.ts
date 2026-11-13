/** Extra sessions in a day. A second (third, ...) session on the same calendar
 * day is a program_day whose `parent_day_id` points at the day it belongs to; it
 * has no schedule position of its own — its parent's day_index / weekday place
 * it on the calendar. Every schedule calculation (cycle length, weekday maps,
 * "which day is today") therefore runs on the PRIMARY days only, and a primary
 * day's sessions are looked up from it. */

type MaybeChild = { parent_day_id?: string | null };

/** The days that sit on the calendar: those that are not another day's session. */
export function primaryDays<T extends MaybeChild>(days: readonly T[]): T[] {
  return days.filter((d) => d.parent_day_id == null);
}

/** The extra sessions of one primary day, in their stored order. */
export function sessionsOf<T extends MaybeChild & { id: string }>(days: readonly T[], dayId: string): T[] {
  return days.filter((d) => d.parent_day_id === dayId);
}

/** Every day in reading order: each calendar day followed by its extra
 * sessions. For lists that show them all (print), where a session must sit
 * under its own day rather than wherever its row happens to be stored. */
export function daysWithSessions<T extends MaybeChild & { id: string }>(days: readonly T[]): T[] {
  return primaryDays(days).flatMap((day) => [day, ...sessionsOf(days, day.id)]);
}
