import "server-only";
import { getTranslations } from "next-intl/server";
import { coachNotificationHtml } from "@/domain/coaching-applications/emails";
import type { ApplicationInput } from "@/domain/coaching-applications/schema";
import { brevoConfig, sendBrevoEmail } from "@/lib/email/brevo";
import { createAnonClient } from "@/lib/supabase/anon";

/** Tells the coach a new application arrived. Best effort: the application is
 * already saved, so every failure here is swallowed.
 *
 * The recipient (business address, else login address) and language come from
 * an RPC that only answers for a just-created application. */
export async function notifyCoachOfApplication(applicationId: string, input: ApplicationInput): Promise<void> {
  try {
    const config = brevoConfig();
    if (!config) return;

    const { data } = await createAnonClient().rpc("application_notify_target", { p_id: applicationId });
    const target = data as { email?: string | null; locale?: string | null } | null;
    if (!target) return;
    const to = target.email?.trim();
    if (!to) return;

    const locale = target.locale === "en" ? "en" : "ar";
    const t = await getTranslations({ locale, namespace: "applications" });
    const origin = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");

    const html = coachNotificationHtml({
      dir: locale === "ar" ? "rtl" : "ltr",
      intro: t("email.newIntro", { name: input.name }),
      rows: [
        [t("fields.name"), input.name],
        [t("fields.email"), input.email],
        [t("fields.phone"), input.phone],
        [t("fields.goal"), t(`goals.${input.goal}`)],
        [t("fields.activityLevel"), t(`activity.${input.activityLevel}`)],
        [t("fields.source"), input.source ?? ""],
        [t("fields.message"), input.message ?? ""],
      ],
      openLabel: t("email.open"),
      openUrl: `${origin}/${locale}/applications/${applicationId}`,
    });
    await sendBrevoEmail(config, { to, subject: t("email.newSubject", { name: input.name }), html });
  } catch {
    /* ignore: see above */
  }
}
