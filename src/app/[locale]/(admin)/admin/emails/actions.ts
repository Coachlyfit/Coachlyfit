"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { brevoConfig, sendBrevoBatch, sendBrevoEmail } from "@/lib/email/brevo";
import { routing } from "@/i18n/routing";
import { renderCampaignEmail } from "@/domain/emails/campaign-email";
import { CampaignsService, type RecipientResult } from "@/domain/emails/campaigns.service";
import { selectRecipients } from "@/domain/emails/recipients";
import { campaignSchema, testEmailSchema } from "./schemas";

// Admin emails go out through Brevo (see lib/email/brevo.ts), in calls of up
// to 100 emails that each carry their own `to`, so no recipient ever sees
// another one. The pause spaces the calls out to stay clear of the API rate limit.
const BATCH_SIZE = 100;
const BATCH_PAUSE_MS = 300;

const localeSchema = z.enum(routing.locales);

// requireAdmin() fails fast; the email_campaigns policies and
// admin_email_recipients() re-check private.is_admin() and are the real boundary.

/** Sends the draft to the signed-in admin only. Nothing is stored. */
export async function sendTestEmailAction(
  locale: string,
  input: unknown
): Promise<{ error: string } | { email: string }> {
  const parsedLocale = localeSchema.safeParse(locale);
  const parsed = testEmailSchema.safeParse(input);
  if (!parsedLocale.success || !parsed.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const brevo = brevoConfig();
  if (!brevo) return { error: "email_not_configured" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "no_admin_email" };

  const t = await getTranslations({ locale: parsedLocale.data, namespace: "admin.emails" });
  const { subject, html } = renderCampaignEmail({
    ...parsed.data,
    coachName: t("preview.sampleName"),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
  });

  const sendError = await sendBrevoEmail(brevo, {
    to: user.email,
    subject: `${t("testPrefix")} ${subject}`,
    html,
  });
  if (sendError) {
    console.error("email campaign: test send failed", sendError);
    return { error: "send_failed" };
  }
  return { email: user.email };
}

/** Sends the campaign, one email per coach. Recipients are resolved here from
 * the filter (and the picked coach ids), never taken from the client. */
export async function sendCampaignAction(
  locale: string,
  input: unknown
): Promise<{ error: string } | { sent: number; failed: number }> {
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, userId, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  const brevo = brevoConfig();
  if (!brevo) return { error: "email_not_configured" };

  const { subject, body, direction, filter, coachIds } = parsed.data;
  const service = new CampaignsService(supabase);

  let campaignId: string;
  let recipients;
  try {
    recipients = selectRecipients(await service.listRecipients(), filter, coachIds);
    if (recipients.length === 0) return { error: "no_recipients" };
    campaignId = await service.createCampaign({
      subject,
      body,
      direction,
      filter,
      recipientCount: recipients.length,
      sentBy: userId,
    });
  } catch {
    return { error: "send_failed" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  let sent = 0;
  let failed = 0;

  for (let start = 0; start < recipients.length; start += BATCH_SIZE) {
    if (start > 0) await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));

    const chunk = recipients.slice(start, start + BATCH_SIZE);
    const errors = await sendBrevoBatch(
      brevo,
      chunk.map((recipient) => ({
        to: recipient.email,
        ...renderCampaignEmail({
          subject,
          body,
          direction,
          coachName: recipient.ownerName ?? recipient.businessName,
          appUrl,
        }),
      }))
    );

    const results: RecipientResult[] = chunk.map((recipient, index) => ({
      coachId: recipient.coachId,
      email: recipient.email,
      error: errors[index] ?? null,
    }));
    for (const result of results) {
      if (result.error) failed++;
      else sent++;
    }

    try {
      await service.recordRecipients(campaignId, results, new Date());
    } catch (err) {
      // The emails are already out; keep sending and keep the counts right.
      console.error("email campaign: recording recipients failed", campaignId, err);
    }
  }

  try {
    await service.setCounts(campaignId, sent, failed);
  } catch (err) {
    console.error("email campaign: saving counts failed", campaignId, err);
  }

  revalidatePath(`/${locale}/admin/emails`);
  return { sent, failed };
}
