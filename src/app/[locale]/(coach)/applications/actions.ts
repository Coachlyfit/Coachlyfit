"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CoachingApplicationsService } from "@/domain/coaching-applications/coaching-applications.service";
import { welcomeHtml } from "@/domain/coaching-applications/emails";
import { triageSchema } from "@/domain/coaching-applications/schema";
import { InvitesService, joinUrl } from "@/domain/clients/invites.service";
import { AlreadyYourClientError } from "@/domain/relationships/relationships.service";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { brevoConfig, sendBrevoEmail } from "@/lib/email/brevo";
import { createClient } from "@/lib/supabase/server";

type VoidResult = { error: string } | void;
export type AcceptResult =
  | { error: string }
  | { joinUrl: string | null; emailed: boolean; linked: boolean };

const idSchema = z.string().uuid();

async function context() {
  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  return coachId ? { supabase, coachId } : null;
}

/** Save status (new / reviewing / rejected / accepted) and notes. Rejecting
 * sends nothing: the applicant is never emailed from here. */
export async function updateApplicationAction(locale: string, id: string, input: unknown): Promise<VoidResult> {
  const parsed = triageSchema.safeParse(input);
  if (!parsed.success || !idSchema.safeParse(id).success) return { error: "invalid_input" };
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };

  try {
    await new CoachingApplicationsService(ctx.supabase).triage(ctx.coachId, id, parsed.data);
  } catch {
    return { error: "failed" };
  }
  revalidatePath(`/${locale}/applications`);
}

/** Accept, optionally creating the client invite and emailing the applicant
 * the link to make their account. Without `sendWelcome` it only changes the
 * status; the coach invites them by hand from Clients. */
export async function acceptApplicationAction(locale: string, id: string, sendWelcome: boolean, coachNotes?: string): Promise<AcceptResult> {
  if (!idSchema.safeParse(id).success) return { error: "invalid_input" };
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };
  const { supabase, coachId } = ctx;

  const service = new CoachingApplicationsService(supabase);
  const app = await service.get(coachId, id).catch(() => null);
  if (!app) return { error: "not_found" };

  let url: string | null = null;
  let emailed = false;
  let linked = false;

  if (sendWelcome) {
    const { data: coach } = await supabase.from("coaches").select("slug, business_name").eq("id", coachId).single();
    if (!coach) return { error: "not_authenticated" };
    try {
      const result = await new InvitesService(supabase).createInvite(coachId, {
        displayName: app.name,
        email: app.email,
        phone: app.phone,
      });
      if (result.linked) linked = true;
      else url = joinUrl(locale, result.token, coach.slug);
    } catch (error) {
      if (error instanceof AlreadyYourClientError) return { error: "already_your_client" };
      // Same trigger as the Clients invite: seat cap or lapsed subscription.
      return { error: (error as { hint?: string } | null)?.hint === "subscription_inactive" ? "subscription_inactive" : "client_limit_reached" };
    }

    const config = brevoConfig();
    if (url && config) {
      const t = await getTranslations({ locale, namespace: "applications.email" });
      const html = welcomeHtml({
        dir: locale === "ar" ? "rtl" : "ltr",
        greeting: t("welcomeGreeting", { name: app.name.split(" ")[0] ?? app.name }),
        body: t("welcomeBody", { coach: coach.business_name }),
        note: coachNotes?.trim() || undefined,
        joinLabel: t("welcomeJoin"),
        joinUrl: url,
      });
      emailed = (await sendBrevoEmail(config, { to: app.email, subject: t("welcomeSubject", { coach: coach.business_name }), html })) === null;
    }
  }

  try {
    await service.triage(coachId, id, { status: "accepted", coachNotes });
  } catch {
    return { error: "failed" };
  }
  revalidatePath(`/${locale}/applications`);
  revalidatePath(`/${locale}/clients`);
  return { joinUrl: url, emailed, linked };
}
