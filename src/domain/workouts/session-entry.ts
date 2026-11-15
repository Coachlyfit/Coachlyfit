type SessionLike = { program_day_id: string; started_at: string; completed_at: string | null };

export type WorkoutEntry =
  | { kind: "redirect"; dayId: string }
  | { kind: "runner" }
  | { kind: "preview" };

/** What opening /c/workout/[dayId] should show. Only an explicit "Start
 * workout" ever creates a session, so opening a card without one in progress
 * is always a preview. */
export function workoutEntry(input: {
  programDayId: string;
  /** The client's session in progress, on any day. */
  active: SessionLike | null;
  /** This day's session this week (done or not). */
  weekSession: SessionLike | null;
  view?: string;
}): WorkoutEntry {
  const { programDayId, active, weekSession, view } = input;
  if (active) {
    return active.program_day_id === programDayId
      ? { kind: "runner" }
      : { kind: "redirect", dayId: active.program_day_id };
  }
  if (view === "summary" && weekSession?.completed_at) return { kind: "runner" };
  return { kind: "preview" };
}

/** The date (YYYY-MM-DD) a workout was actually done, or null when that is
 * the day it was scheduled for. */
export function doneOn(session: Pick<SessionLike, "started_at"> | undefined, scheduledDate: string): string | null {
  if (!session) return null;
  const actual = session.started_at.slice(0, 10);
  return actual === scheduledDate ? null : actual;
}
