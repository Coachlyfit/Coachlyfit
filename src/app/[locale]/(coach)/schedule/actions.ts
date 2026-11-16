"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { requireCoach } from "@/lib/auth/require-coach";
import { getAuthUser } from "@/lib/auth/session";
import { getFeatures } from "@/lib/features";
import { AppointmentsService, appointmentError } from "@/domain/appointments/appointments.service";
import {
  appointmentFormSchema,
  reasonSchema,
  rescheduleSchema,
} from "@/domain/appointments/schemas";
import { DEFAULT_TIME_ZONE, isValidTimeZone, zonedToUtc } from "@/domain/appointments/tz";

type ActionResult = { error: string } | void;

// Signed in as a coach or team member, on a plan with scheduling. The
// triggers, constraints and policies on appointments (20261123000001) are the
// boundary; this answers early with a code the UI can show.
async function requireAppointments() {
  const coach = await requireCoach();
  if ("error" in coach) return coach;
  if (!(await getFeatures()).appointments) return { error: "upgrade_required" as const };
  return coach;
}

/** The coach's own zone: what "10:00" in the form means. */
async function viewerTimeZone(supabase: SupabaseClient<Database>) {
  const user = await getAuthUser();
  if (!user) return DEFAULT_TIME_ZONE;
  const { data } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  return data?.timezone && isValidTimeZone(data.timezone) ? data.timezone : DEFAULT_TIME_ZONE;
}

function toRange(input: { date: string; time: string; duration_minutes: number }, tz: string) {
  const start = zonedToUtc(input.date, input.time, tz);
  if (!start) return null;
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + input.duration_minutes * 60_000).toISOString() };
}

function done(locale: string) {
  revalidatePath(`/${locale}/schedule`);
  revalidatePath(`/${locale}/clients`, "layout");
}

export async function createAppointmentAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = appointmentFormSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const coach = await requireAppointments();
  if ("error" in coach) return { error: coach.error };

  const range = toRange(parsed.data, await viewerTimeZone(coach.supabase));
  if (!range) return { error: "invalid_time" };

  try {
    await new AppointmentsService(coach.supabase).create(coach.coachId, {
      client_id: parsed.data.client_id,
      ...range,
      type: parsed.data.type,
      location_or_link: parsed.data.location_or_link || null,
      notes: parsed.data.notes || null,
      status: "confirmed",
    });
  } catch (error) {
    return { error: appointmentError(error) };
  }
  done(locale);
}

export async function rescheduleAppointmentAction(locale: string, id: string, input: unknown): Promise<ActionResult> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const coach = await requireAppointments();
  if ("error" in coach) return { error: coach.error };

  const range = toRange(parsed.data, await viewerTimeZone(coach.supabase));
  if (!range) return { error: "invalid_time" };

  try {
    const ok = await new AppointmentsService(coach.supabase).reschedule(id, {
      ...range,
      type: parsed.data.type,
      location_or_link: parsed.data.location_or_link || null,
    });
    if (!ok) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: appointmentError(error) };
  }
  done(locale);
}

type Transition = "confirm" | "complete" | "no_show";

export async function transitionAppointmentAction(locale: string, id: string, to: Transition): Promise<ActionResult> {
  const coach = await requireAppointments();
  if ("error" in coach) return { error: coach.error };

  const service = new AppointmentsService(coach.supabase);
  try {
    const ok = await (to === "confirm" ? service.confirm(id) : to === "complete" ? service.complete(id) : service.markNoShow(id));
    if (!ok) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: appointmentError(error) };
  }
  done(locale);
}

/** Decline a request or cancel a confirmed session. */
export async function cancelAppointmentAction(locale: string, id: string, reason: string): Promise<ActionResult> {
  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) return { error: "invalid_input" };

  const coach = await requireAppointments();
  if ("error" in coach) return { error: coach.error };

  try {
    const ok = await new AppointmentsService(coach.supabase).cancel(id, parsedReason.data);
    if (!ok) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: appointmentError(error) };
  }
  done(locale);
}
