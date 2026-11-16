import { describe, expect, it } from "vitest";
import { GoogleApiError } from "@/lib/google/errors";
import type { EventsApi, GoogleEvent } from "@/lib/google/events-api";
import { buildEvent, eventIdFor } from "./event";
import { reconcile } from "./reconcile";

const APPOINTMENT = {
  id: "7f9c2e3a-1b4d-4c5e-8a6f-0123456789ab",
  status: "confirmed",
  starts_at: "2026-01-18T07:00:00Z",
  ends_at: "2026-01-18T08:00:00Z",
  type: "online",
  location_or_link: "https://meet.example/abc",
};
const event = buildEvent(APPOINTMENT, { clientName: "Sara", locale: "en" });

/** A tiny Google: events by id, deleted ids stay reserved (as the real one does). */
class FakeGoogle implements EventsApi {
  events = new Map<string, GoogleEvent>();
  deleted = new Set<string>();
  calls: string[] = [];
  private etag = 0;

  async insert(e: GoogleEvent) {
    this.calls.push("insert");
    if (this.events.has(e.id) || this.deleted.has(e.id)) throw new GoogleApiError(409, "duplicate");
    this.events.set(e.id, e);
    return { id: e.id, etag: `"${++this.etag}"` };
  }
  async patch(id: string, e: Partial<GoogleEvent>) {
    this.calls.push("patch");
    const current = this.events.get(id);
    if (!current && !this.deleted.has(id)) throw new GoogleApiError(404, "notFound");
    this.deleted.delete(id);
    this.events.set(id, { ...(current ?? event), ...e } as GoogleEvent);
    return { id, etag: `"${++this.etag}"` };
  }
  async remove(id: string) {
    this.calls.push("remove");
    if (!this.events.has(id)) throw new GoogleApiError(this.deleted.has(id) ? 410 : 404, "notFound");
    this.events.delete(id);
    this.deleted.add(id);
  }
}

describe("buildEvent", () => {
  it("uses a deterministic base32hex id", () => {
    expect(event.id).toBe("7f9c2e3a1b4d4c5e8a6f0123456789ab");
    expect(event.id).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(eventIdFor(APPOINTMENT.id)).toBe(event.id);
  });

  it("puts client name + type in the title and the link in the location, with no private data", () => {
    expect(event.summary).toBe("Sara · Online");
    expect(event.location).toBe("https://meet.example/abc");
    expect(event.description).not.toContain("Sara");
    expect(event.extendedProperties?.private).toEqual({ coachlyAppointmentId: APPOINTMENT.id });
  });

  it("marks a request tentative and writes Arabic titles for an Arabic coach", () => {
    expect(buildEvent({ ...APPOINTMENT, status: "requested" }, { clientName: "سارة", locale: "ar" })).toMatchObject({
      status: "tentative",
      summary: "سارة · أونلاين",
    });
  });
});

describe("reconcile", () => {
  it("creates the event for a new appointment", async () => {
    const google = new FakeGoogle();
    const result = await reconcile({ status: "confirmed", google_event_id: null }, event, google);
    expect(result).toMatchObject({ action: "inserted", eventId: event.id });
    expect(google.events.size).toBe(1);
  });

  it("is idempotent: running the same job twice, or after a lost response, never duplicates", async () => {
    const google = new FakeGoogle();
    // First run: Google created it but we never saw the response (google_event_id still null).
    await reconcile({ status: "confirmed", google_event_id: null }, event, google);
    // Retry: insert collides (409) and falls back to patch.
    const retry = await reconcile({ status: "confirmed", google_event_id: null }, event, google);
    expect(retry.action).toBe("patched");
    expect(google.events.size).toBe(1);
    expect(google.calls).toEqual(["insert", "insert", "patch"]);
  });

  it("patches when it already has an id, and recreates if Google lost the event", async () => {
    const google = new FakeGoogle();
    const lost = await reconcile({ status: "confirmed", google_event_id: event.id }, event, google);
    expect(lost.action).toBe("inserted");
    const again = await reconcile({ status: "confirmed", google_event_id: event.id }, { ...event, summary: "Moved" }, google);
    expect(again.action).toBe("patched");
    expect(google.events.get(event.id)?.summary).toBe("Moved");
    expect(google.events.size).toBe(1);
  });

  it("deletes for a cancelled appointment, and tolerates it already being gone", async () => {
    const google = new FakeGoogle();
    await reconcile({ status: "confirmed", google_event_id: null }, event, google);
    expect(await reconcile({ status: "cancelled", google_event_id: event.id }, event, google)).toEqual({
      action: "deleted",
      eventId: null,
      etag: null,
    });
    expect(google.events.size).toBe(0);
    // Second run: 410 Gone is fine.
    expect((await reconcile({ status: "cancelled", google_event_id: null }, event, google)).action).toBe("deleted");
  });

  it("restores an event the coach deleted in Google when the appointment is live again", async () => {
    const google = new FakeGoogle();
    await reconcile({ status: "confirmed", google_event_id: null }, event, google);
    await reconcile({ status: "cancelled", google_event_id: event.id }, event, google);
    // The id is still reserved at Google: insert 409s, then patch restores it.
    const back = await reconcile({ status: "confirmed", google_event_id: null }, event, google);
    expect(back.action).toBe("patched");
    expect(google.events.size).toBe(1);
  });

  it("lets other failures through for the retry logic", async () => {
    const failing: EventsApi = {
      insert: async () => {
        throw new GoogleApiError(503, "backendError");
      },
      patch: async () => {
        throw new GoogleApiError(503, "backendError");
      },
      remove: async () => {
        throw new GoogleApiError(500, "backendError");
      },
    };
    await expect(reconcile({ status: "confirmed", google_event_id: null }, event, failing)).rejects.toMatchObject({ status: 503 });
    await expect(reconcile({ status: "cancelled", google_event_id: null }, event, failing)).rejects.toMatchObject({ status: 500 });
  });
});
