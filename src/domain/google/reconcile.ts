import { GoogleApiError } from "@/lib/google/errors";
import type { EventsApi, GoogleEvent } from "@/lib/google/events-api";

export type ReconcileResult = { action: "inserted" | "patched" | "deleted"; eventId: string | null; etag: string | null };

const gone = (error: unknown) => error instanceof GoogleApiError && (error.status === 404 || error.status === 410);
const exists = (error: unknown) => error instanceof GoogleApiError && error.status === 409;

/** Make Google match the appointment as it is *now*. State-based on purpose,
 * not "replay what changed": a job that runs twice, late, or after the
 * appointment changed again still ends in the right place.
 *
 *  cancelled           -> delete the event (already gone is fine)
 *  otherwise, has id   -> patch; if Google lost it, fall through to create
 *  otherwise           -> create with the deterministic id; a 409 means it
 *                         already exists (a retry after a lost response, or an
 *                         event deleted in Google whose id is still reserved),
 *                         so patch it back to the right state instead.
 * Never creates a second event for one appointment. */
export async function reconcile(
  appointment: { status: string; google_event_id: string | null },
  event: GoogleEvent,
  api: EventsApi
): Promise<ReconcileResult> {
  if (appointment.status === "cancelled") {
    try {
      await api.remove(event.id);
    } catch (error) {
      if (!gone(error)) throw error;
    }
    return { action: "deleted", eventId: null, etag: null };
  }

  if (appointment.google_event_id) {
    try {
      const patched = await api.patch(event.id, event);
      return { action: "patched", eventId: patched.id, etag: patched.etag };
    } catch (error) {
      if (!gone(error)) throw error;
    }
  }

  try {
    const created = await api.insert(event);
    return { action: "inserted", eventId: created.id, etag: created.etag };
  } catch (error) {
    if (!exists(error)) throw error;
    const patched = await api.patch(event.id, event);
    return { action: "patched", eventId: patched.id, etag: patched.etag };
  }
}
