import type { RemoteEvent } from "@/lib/google/events-api";

export type PullAppointment = {
  id: string;
  coach_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  google_event_id: string | null;
  google_etag: string | null;
};

export type Change =
  | { kind: "moved"; appointmentId: string; startsAt: string; endsAt: string }
  | { kind: "deleted"; appointmentId: string };

const live = (status: string) => status === "requested" || status === "confirmed";
const sameInstant = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

type Context = {
  coachId: string;
  appointments: Map<string, PullAppointment>;
  /** Appointments with a push still waiting: Google is *behind*, not changed. */
  pending: Set<string>;
};

/** Which appointments did the coach change in Google? `events` is what Google
 * reports (a sync-token delta, or a full listing). An event counts only when
 *  - it carries our appointment id and that appointment is this coach's and
 *    still live,
 *  - no push for it is waiting (otherwise Google is simply out of date), and
 *  - its etag isn't the one we stored from our own last write (our echo).
 * Then it is a delete (status "cancelled") or a move (different start/end). */
export function detectChanges(events: RemoteEvent[], ctx: Context): Change[] {
  const changes = new Map<string, Change>();
  for (const event of events) {
    const id = event.extendedProperties?.private?.coachlyAppointmentId;
    const appointment = id ? ctx.appointments.get(id) : undefined;
    if (!id || !appointment || appointment.coach_id !== ctx.coachId) continue;
    if (!live(appointment.status) || ctx.pending.has(id)) continue;
    if (event.etag && event.etag === appointment.google_etag) continue;

    if (event.status === "cancelled") {
      changes.set(id, { kind: "deleted", appointmentId: id });
    } else if (event.start?.dateTime && event.end?.dateTime) {
      if (!sameInstant(event.start.dateTime, appointment.starts_at) || !sameInstant(event.end.dateTime, appointment.ends_at)) {
        changes.set(id, { kind: "moved", appointmentId: id, startsAt: event.start.dateTime, endsAt: event.end.dateTime });
      } else {
        changes.delete(id);
      }
    }
  }
  return [...changes.values()];
}

/** After a full resync (sync token expired) deletions are not reported, they
 * are just absent: a live, already-synced, upcoming appointment whose event is
 * missing from the full listing was deleted in Google. Not used for the first
 * baseline of a new channel, where events may simply not exist yet. */
export function detectMissing(
  listedEventIds: Set<string>,
  appointments: PullAppointment[],
  ctx: { pending: Set<string>; now: Date }
): Change[] {
  return appointments
    .filter(
      (a) =>
        live(a.status) &&
        a.google_event_id !== null &&
        !listedEventIds.has(a.google_event_id) &&
        !ctx.pending.has(a.id) &&
        new Date(a.starts_at) > ctx.now
    )
    .map((a) => ({ kind: "deleted" as const, appointmentId: a.id }));
}
