import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AppointmentType } from "./schemas";

type Db = SupabaseClient<Database>;
export type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
export type AppointmentStatus = AppointmentRow["status"];

/** An appointment with the client's display name, for lists and the calendar. */
export type AppointmentWithClient = AppointmentRow & { client: { display_name: string } | null };

const WITH_CLIENT = "*, client:clients(display_name)";

/** Postgres refusals -> the codes the UI translates. The triggers and
 * constraints in 20261123000001_appointments.sql are the real rules; this just
 * names what they say. */
export function appointmentError(error: unknown): string {
  const { code, hint, message } = (error ?? {}) as { code?: string; hint?: string; message?: string };
  if (code === "23P01") {
    return message?.includes("appointments_no_client_overlap") ? "client_busy" : "slot_taken";
  }
  if (
    hint === "upgrade_required" ||
    hint === "invalid_client" ||
    hint === "in_the_past" ||
    hint === "cutoff_passed" ||
    hint === "invalid_transition" ||
    hint === "not_started" ||
    hint === "invalid_status"
  ) {
    return hint;
  }
  // RLS refused the row (also a lapsed or suspended coach), or a client edit.
  if (code === "42501") return "not_found_or_forbidden";
  return "unknown";
}

export type NewAppointment = {
  client_id: string;
  starts_at: string;
  ends_at: string;
  type: AppointmentType;
  location_or_link: string | null;
  notes: string | null;
  status: "requested" | "confirmed";
};

export class AppointmentsService {
  constructor(private db: Db) {}

  async create(coachId: string, input: NewAppointment): Promise<string> {
    const { data, error } = await this.db
      .from("appointments")
      .insert({ coach_id: coachId, ...input })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  /** Appointments overlapping [from, to), soonest first. RLS decides which
   * the caller may see (owner: all, member: assigned clients). */
  async listRange(from: Date, to: Date): Promise<AppointmentWithClient[]> {
    const { data, error } = await this.db
      .from("appointments")
      .select(WITH_CLIENT)
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString())
      .order("starts_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as AppointmentWithClient[];
  }

  async listForClient(clientId: string): Promise<AppointmentRow[]> {
    const { data, error } = await this.db
      .from("appointments")
      .select("*")
      .eq("client_id", clientId)
      .order("starts_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  }

  /** Live requests, oldest first (the coach's to-do list). */
  async pendingRequests(): Promise<AppointmentWithClient[]> {
    const { data, error } = await this.db
      .from("appointments")
      .select(WITH_CLIENT)
      .eq("status", "requested")
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as AppointmentWithClient[];
  }

  /** Confirmed sessions where the client asked to move. */
  async rescheduleRequests(): Promise<AppointmentWithClient[]> {
    const { data, error } = await this.db
      .from("appointments")
      .select(WITH_CLIENT)
      .eq("status", "confirmed")
      .not("reschedule_requested_at", "is", null)
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as AppointmentWithClient[];
  }

  async nextForClient(clientId: string, now = new Date()): Promise<AppointmentRow | null> {
    const { data, error } = await this.db
      .from("appointments")
      .select("*")
      .eq("client_id", clientId)
      .in("status", ["requested", "confirmed"])
      .gt("ends_at", now.toISOString())
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  // Each write returns false when RLS matched no row (not yours, or gone) and
  // throws a Postgres error for a rule the triggers/constraints enforce.
  private async update(id: string, patch: Database["public"]["Tables"]["appointments"]["Update"]): Promise<boolean> {
    const { data, error } = await this.db.from("appointments").update(patch).eq("id", id).select("id");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  confirm(id: string) {
    return this.update(id, { status: "confirmed" });
  }

  /** Decline a request, or cancel a confirmed session. */
  cancel(id: string, reason: string | null) {
    return this.update(id, { status: "cancelled", cancel_reason: reason || null });
  }

  complete(id: string) {
    return this.update(id, { status: "completed" });
  }

  markNoShow(id: string) {
    return this.update(id, { status: "no_show" });
  }

  reschedule(
    id: string,
    patch: { starts_at: string; ends_at: string; type: AppointmentType; location_or_link: string | null }
  ) {
    return this.update(id, patch);
  }

  /** Client asks the coach to move a confirmed session. */
  requestReschedule(id: string, note: string | null) {
    return this.update(id, { reschedule_requested_at: new Date().toISOString(), reschedule_note: note || null });
  }
}
