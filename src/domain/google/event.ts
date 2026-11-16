import { appointmentSummary, typeLabel } from "@/domain/appointments/labels";
import type { AppLocale } from "@/domain/locale";
import type { GoogleEvent } from "@/lib/google/events-api";

/** Google lets the caller choose an event id (base32hex: a-v, 0-9; 5-1024
 * chars). An appointment's uuid without dashes is valid and deterministic, so
 * creating the "same" event twice collides (409) instead of duplicating. */
export function eventIdFor(appointmentId: string): string {
  return appointmentId.replace(/-/g, "").toLowerCase();
}

export type SyncableAppointment = {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  type: string;
  location_or_link: string | null;
};

/** What Coachly puts in the coach's Google calendar. Title = client name +
 * session type; the link or place goes in `location`. Nothing else about the
 * client (no notes, contact details, goals) is written to Google. */
export function buildEvent(a: SyncableAppointment, ctx: { clientName: string | null; locale: AppLocale }): GoogleEvent {
  const place = a.location_or_link?.trim() || null;
  const description = [ctx.locale === "ar" ? "جلسة Coachly Fit" : "Coachly Fit session", typeLabel(a.type, ctx.locale), place]
    .filter(Boolean)
    .join("\n");
  return {
    id: eventIdFor(a.id),
    summary: appointmentSummary({ locale: ctx.locale, viewer: "coach", name: ctx.clientName, type: a.type }),
    ...(place ? { location: place } : {}),
    description,
    // An unanswered request holds the slot but isn't promised yet.
    status: a.status === "requested" ? "tentative" : "confirmed",
    start: { dateTime: new Date(a.starts_at).toISOString() },
    end: { dateTime: new Date(a.ends_at).toISOString() },
    extendedProperties: { private: { coachlyAppointmentId: a.id } },
  };
}
