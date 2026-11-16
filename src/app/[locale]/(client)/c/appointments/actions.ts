"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { AppointmentsService, appointmentError } from "@/domain/appointments/appointments.service";
import { AvailabilityService } from "@/domain/appointments/availability.service";
import { FeedService } from "@/domain/appointments/feed.service";
import { reasonSchema, sessionRequestSchema } from "@/domain/appointments/schemas";
import { isOfferedSlot } from "@/domain/appointments/slots";
import { DEFAULT_TIME_ZONE, addDays, isValidTimeZone, localDateTime, startOfDay } from "@/domain/appointments/tz";

type ActionResult = { error: string } | void;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS_AHEAD = 90;

/** The signed-in client, their coach, their display zone, and whether that
 * coach's plan has scheduling (a client can't see plans, so the RPC answers).
 * Authorization is still RLS + triggers; this is for early, readable errors. */
async function clientContext() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "not_authenticated" as const };

  const [{ data: client }, { data: profile }, { data: enabled }] = await Promise.all([
    supabase.from("clients").select("id, coach_id").eq("profile_id", user.id).maybeSingle(),
    supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle(),
    supabase.rpc("appointments_enabled"),
  ]);
  if (!client) return { error: "not_found_or_forbidden" as const };
  if (!enabled) return { error: "unavailable" as const };

  const timeZone = profile?.timezone && isValidTimeZone(profile.timezone) ? profile.timezone : DEFAULT_TIME_ZONE;
  return { supabase, user, client, timeZone };
}

/** Free slots on one calendar day of the client's own timezone. Read for
 * useQuery, so it throws instead of returning { error }. */
export async function listFreeSlotsAction(date: string): Promise<{ start: string; end: string }[]> {
  if (!DATE.test(date)) throw new Error("invalid_input");
  const ctx = await clientContext();
  if (ctx.error) throw new Error(ctx.error);

  const today = localDateTime(new Date(), ctx.timeZone).date;
  if (date < today || date > addDays(today, MAX_DAYS_AHEAD)) return [];

  const { slots } = await new AvailabilityService(ctx.supabase).freeSlots(
    ctx.client.coach_id,
    startOfDay(date, ctx.timeZone),
    startOfDay(addDays(date, 1), ctx.timeZone)
  );
  return slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() }));
}

export async function requestAppointmentAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = sessionRequestSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const ctx = await clientContext();
  // `ctx.error`, not `"error" in ctx`: the inferred union gives the success
  // member an optional `error?: undefined`, so `in` doesn't narrow it away.
  if (ctx.error) return { error: ctx.error };

  // The slot must be one the coach offers right now. Without this a client
  // could ask for 3am; the coach still confirms, and the overlap constraints
  // still hold either way.
  const start = new Date(parsed.data.starts_at);
  const availability = new AvailabilityService(ctx.supabase);
  const { slot_minutes } = await availability.settings(ctx.client.coach_id);
  const end = new Date(start.getTime() + slot_minutes * 60_000);
  const { slots } = await availability.freeSlots(ctx.client.coach_id, start, end);
  if (!isOfferedSlot(slots, start, end)) return { error: "slot_taken" };

  try {
    await new AppointmentsService(ctx.supabase).create(ctx.client.coach_id, {
      client_id: ctx.client.id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      type: parsed.data.type,
      location_or_link: null,
      notes: parsed.data.notes || null,
      status: "requested",
    });
  } catch (error) {
    return { error: appointmentError(error) };
  }
  revalidatePath(`/${locale}/c`, "layout");
}

export async function cancelMyAppointmentAction(locale: string, id: string, reason: string): Promise<ActionResult> {
  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) return { error: "invalid_input" };
  const supabase = await createClient();
  try {
    const ok = await new AppointmentsService(supabase).cancel(id, parsedReason.data);
    if (!ok) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: appointmentError(error) };
  }
  revalidatePath(`/${locale}/c`, "layout");
}

export async function requestRescheduleAction(locale: string, id: string, note: string): Promise<ActionResult> {
  const parsedNote = reasonSchema.safeParse(note);
  if (!parsedNote.success) return { error: "invalid_input" };
  const supabase = await createClient();
  try {
    const ok = await new AppointmentsService(supabase).requestReschedule(id, parsedNote.data);
    if (!ok) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: appointmentError(error) };
  }
  revalidatePath(`/${locale}/c`, "layout");
}

export async function saveMyTimeZoneAction(locale: string, timeZone: string): Promise<ActionResult> {
  if (!isValidTimeZone(timeZone)) return { error: "invalid_input" };
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "not_authenticated" };
  const { error } = await supabase.from("profiles").update({ timezone: timeZone }).eq("id", user.id);
  if (error) return { error: "unknown" };
  revalidatePath(`/${locale}/c`, "layout");
}

export async function rotateMyFeedTokenAction(): Promise<{ error: string } | { token: string }> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "not_authenticated" };
  try {
    return { token: await new FeedService(supabase).rotate(user.id) };
  } catch {
    return { error: "unknown" };
  }
}
