import type { AppointmentRow, AppointmentWithClient } from "@/domain/appointments/appointments.service";
import type { AppointmentView } from "./shared";

export function toView(a: AppointmentRow | AppointmentWithClient, clientName?: string): AppointmentView {
  return {
    id: a.id,
    clientId: a.client_id,
    clientName: clientName ?? ("client" in a ? (a.client?.display_name ?? "") : ""),
    startsAt: a.starts_at,
    endsAt: a.ends_at,
    type: a.type as AppointmentView["type"],
    status: a.status as AppointmentView["status"],
    location: a.location_or_link,
    notes: a.notes,
    cancelReason: a.cancel_reason,
    rescheduleRequestedAt: a.reschedule_requested_at,
    rescheduleNote: a.reschedule_note,
    proposedStartsAt: a.proposed_starts_at,
    proposedEndsAt: a.proposed_ends_at,
  };
}
