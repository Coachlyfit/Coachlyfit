"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-coach";
import { getFeatures } from "@/lib/features";
import { GoogleConnectionService } from "@/domain/google/connection.service";
import { AvailabilityService } from "@/domain/appointments/availability.service";
import { FeedService } from "@/domain/appointments/feed.service";
import { availabilitySchema, exceptionSchema, settingsSchema } from "@/domain/appointments/schemas";
import { isValidTimeZone } from "@/domain/appointments/tz";

type ActionResult = { error: string } | void;

// Availability, days off and the cancel cutoff are tenant config: owner only.
// RLS (owner_write) is the real gate; this gives the UI a code.
async function requireScheduleOwner() {
  const owner = await requireOwner();
  if ("error" in owner) return owner;
  if (!(await getFeatures()).appointments) return { error: "upgrade_required" as const };
  return owner;
}

function done(locale: string) {
  revalidatePath(`/${locale}/settings/schedule`);
  revalidatePath(`/${locale}/schedule`);
}

/** Replaces the weekly hours and sets the display zone for the whole account. */
export async function saveAvailabilityAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success || !isValidTimeZone(parsed.data.timezone)) return { error: "invalid_input" };

  const owner = await requireScheduleOwner();
  if ("error" in owner) return { error: owner.error };

  try {
    await new AvailabilityService(owner.supabase).replaceRules(owner.coachId, parsed.data.timezone, parsed.data.rules);
    const { error } = await owner.supabase.from("profiles").update({ timezone: parsed.data.timezone }).eq("id", owner.coachId);
    if (error) throw error;
  } catch {
    return { error: "unknown" };
  }
  done(locale);
}

export async function saveExceptionAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = exceptionSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const owner = await requireScheduleOwner();
  if ("error" in owner) return { error: owner.error };

  try {
    await new AvailabilityService(owner.supabase).saveException(owner.coachId, parsed.data);
  } catch {
    return { error: "unknown" };
  }
  done(locale);
}

export async function removeExceptionAction(locale: string, id: string): Promise<ActionResult> {
  const owner = await requireScheduleOwner();
  if ("error" in owner) return { error: owner.error };

  try {
    if (!(await new AvailabilityService(owner.supabase).removeException(id))) return { error: "not_found_or_forbidden" };
  } catch {
    return { error: "unknown" };
  }
  done(locale);
}

export async function saveScheduleSettingsAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const owner = await requireScheduleOwner();
  if ("error" in owner) return { error: owner.error };

  try {
    await new AvailabilityService(owner.supabase).saveSettings(owner.coachId, parsed.data);
  } catch {
    return { error: "unknown" };
  }
  done(locale);
}

/** Delete the stored connection and queued jobs, revoke at Google, and
 * optionally delete the Coachly Fit calendar. Not plan-gated: a coach who
 * downgraded must still be able to disconnect. Goes through the
 * google_disconnect RPC (the caller's own row only), not the service role. */
export async function disconnectGoogleAction(locale: string, deleteCalendar: boolean): Promise<ActionResult> {
  const owner = await requireOwner();
  if ("error" in owner) return { error: owner.error };
  try {
    await new GoogleConnectionService(owner.supabase).disconnect({ deleteCalendar: !!deleteCalendar });
  } catch {
    return { error: "unknown" };
  }
  done(locale);
}

/** New private feed URL; the old one stops working. Returns the new token. */
export async function rotateFeedTokenAction(): Promise<{ error: string } | { token: string }> {
  const owner = await requireScheduleOwner();
  if ("error" in owner) return { error: owner.error };
  try {
    return { token: await new FeedService(owner.supabase).rotate(owner.coachId) };
  } catch {
    return { error: "unknown" };
  }
}
