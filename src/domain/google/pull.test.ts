import { describe, expect, it } from "vitest";
import type { RemoteEvent } from "@/lib/google/events-api";
import { detectChanges, detectMissing, type PullAppointment } from "./pull";

const A = "7f9c2e3a-1b4d-4c5e-8a6f-0123456789ab";
const appt = (over: Partial<PullAppointment> = {}): PullAppointment => ({
  id: A,
  coach_id: "coach-1",
  status: "confirmed",
  starts_at: "2026-01-19T07:00:00Z",
  ends_at: "2026-01-19T08:00:00Z",
  google_event_id: "ev1",
  google_etag: '"1"',
  ...over,
});
const event = (over: Partial<RemoteEvent> = {}): RemoteEvent => ({
  id: "ev1",
  etag: '"2"',
  status: "confirmed",
  start: { dateTime: "2026-01-19T07:00:00Z" },
  end: { dateTime: "2026-01-19T08:00:00Z" },
  extendedProperties: { private: { coachlyAppointmentId: A } },
  ...over,
});
const ctx = (appointments: PullAppointment[] = [appt()], pending: string[] = []) => ({
  coachId: "coach-1",
  appointments: new Map(appointments.map((a) => [a.id, a])),
  pending: new Set(pending),
});

describe("detectChanges", () => {
  it("sees an event moved in Google as a move, comparing instants not strings", () => {
    const moved = event({ start: { dateTime: "2026-01-19T11:00:00+02:00" }, end: { dateTime: "2026-01-19T12:00:00+02:00" } });
    expect(detectChanges([moved], ctx())).toEqual([
      { kind: "moved", appointmentId: A, startsAt: "2026-01-19T11:00:00+02:00", endsAt: "2026-01-19T12:00:00+02:00" },
    ]);
  });

  it("sees a deleted event (status cancelled) as a delete", () => {
    expect(detectChanges([event({ status: "cancelled", start: undefined, end: undefined })], ctx())).toEqual([
      { kind: "deleted", appointmentId: A },
    ]);
  });

  it("ignores our own echo: the event carries the etag we stored from our last write", () => {
    const echo = event({ etag: '"1"', start: { dateTime: "2026-01-19T09:00:00Z" }, end: { dateTime: "2026-01-19T10:00:00Z" } });
    expect(detectChanges([echo], ctx())).toEqual([]);
  });

  it("ignores an edit that didn't move the session (e.g. a changed description)", () => {
    expect(detectChanges([event()], ctx())).toEqual([]);
  });

  it("ignores events while a push for that appointment is still waiting (Google is behind, not changed)", () => {
    const moved = event({ start: { dateTime: "2026-01-19T09:00:00Z" }, end: { dateTime: "2026-01-19T10:00:00Z" } });
    expect(detectChanges([moved], ctx([appt()], [A]))).toEqual([]);
  });

  it("ignores events that aren't ours, are another coach's, or belong to a finished appointment", () => {
    const moved = { start: { dateTime: "2026-01-19T09:00:00Z" }, end: { dateTime: "2026-01-19T10:00:00Z" } };
    expect(detectChanges([event({ ...moved, extendedProperties: undefined })], ctx())).toEqual([]);
    expect(detectChanges([event(moved)], ctx([appt({ coach_id: "someone-else" })]))).toEqual([]);
    expect(detectChanges([event(moved)], ctx([appt({ status: "cancelled" })]))).toEqual([]);
    expect(detectChanges([event(moved)], ctx([]))).toEqual([]);
  });

  it("keeps only the latest word on an appointment", () => {
    const first = event({ start: { dateTime: "2026-01-19T09:00:00Z" }, end: { dateTime: "2026-01-19T10:00:00Z" } });
    const reverted = event({ etag: '"3"' });
    expect(detectChanges([first, reverted], ctx())).toEqual([]);
  });
});

describe("detectMissing (after a full resync)", () => {
  const now = new Date("2026-01-18T10:00:00Z");

  it("flags a synced, upcoming, live appointment whose event is gone", () => {
    expect(detectMissing(new Set(["other"]), [appt()], { pending: new Set(), now })).toEqual([{ kind: "deleted", appointmentId: A }]);
  });

  it("leaves alone: present events, unsynced appointments, waiting pushes, past and finished ones", () => {
    const none = { pending: new Set<string>(), now };
    expect(detectMissing(new Set(["ev1"]), [appt()], none)).toEqual([]);
    expect(detectMissing(new Set(), [appt({ google_event_id: null })], none)).toEqual([]);
    expect(detectMissing(new Set(), [appt()], { pending: new Set([A]), now })).toEqual([]);
    expect(detectMissing(new Set(), [appt({ starts_at: "2026-01-10T07:00:00Z" })], none)).toEqual([]);
    expect(detectMissing(new Set(), [appt({ status: "completed" })], none)).toEqual([]);
  });
});
