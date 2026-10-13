"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { brevoConfig, brevoOutreachConfig, sendBrevoBatch, sendBrevoEmail, sendBrevoMessage } from "@/lib/email/brevo";
import { routing } from "@/i18n/routing";
import { NEUTRAL_NAME, renderCampaignEmail } from "@/domain/emails/campaign-email";
import { CampaignsService, type RecipientResult } from "@/domain/emails/campaigns.service";
import { selectRecipients } from "@/domain/emails/recipients";
import { LeadsService } from "@/domain/leads/leads.service";
import { campaignSchema, leadSendSchema, MAX_LEADS_PER_SEND, testEmailSchema } from "./schemas";

// Admin emails go out through Brevo (see lib/email/brevo.ts), in calls of up
// to 100 emails that each carry their own `to`, so no recipient ever sees
// another one. The pause spaces the calls out to stay clear of the API rate limit.
const BATCH_SIZE = 100;
const BATCH_PAUSE_MS = 300;

// Outreach to leads goes one email per call, each with its own unsubscribe
// link and headers, with the same pause between them.
const LEAD_PAUSE_MS = 300;

const localeSchema = z.enum(routing.locales);

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

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

  // A test for leads goes out as the real thing would: outreach sender and
  // footer. Its unsubscribe link has no token, so it opens the "invalid link" page.
  const { audience, ...content } = parsed.data;
  const outreach = audience === "leads";
  const brevo = outreach ? brevoOutreachConfig() : brevoConfig();
  if (!brevo) return { error: outreach ? "outreach_not_configured" : "email_not_configured" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "no_admin_email" };

  const t = await getTranslations({ locale: parsedLocale.data, namespace: "admin.emails" });
  const { subject, html } = renderCampaignEmail({
    ...content,
    coachName: t("preview.sampleName"),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
    ...(outreach ? { unsubscribeUrl: `${appOrigin()}/${content.direction === "rtl" ? "ar" : "en"}/unsubscribe` } : {}),
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
/** Sends an outreach email to leads, one at a time. The ids come from the
 * client; everything else about a lead is read here right before its email,
 * so someone who unsubscribed a minute ago is skipped, not emailed. */
export async function sendLeadEmailsAction(
  locale: string,
  input: unknown
): Promise<{ error: string } | { sent: number; failed: number; skipped: number; reason: string | null }> {
  const parsed = leadSendSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const { subject, body, direction } = parsed.data;
  const leadIds = [...new Set(parsed.data.leadIds)];
  if (leadIds.length > MAX_LEADS_PER_SEND) return { error: "too_many_leads" };

  const { supabase, userId, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  // No app URL means no working unsubscribe link, so nothing goes out.
  const brevo = brevoOutreachConfig();
  const appUrl = appOrigin();
  if (!brevo || !appUrl) return { error: "outreach_not_configured" };

  const service = new LeadsService(supabase);
  const linkLocale = direction === "rtl" ? "ar" : "en";
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  // Brevo's own words for the first failure, shown to the admin as-is.
  let reason: string | null = null;

  for (const [index, leadId] of leadIds.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, LEAD_PAUSE_MS));

    let lead;
    try {
      lead = await service.getForSend(leadId);
    } catch (err) {
      // Unknown whether they unsubscribed: don't send.
      console.error("lead email: reading lead failed", leadId, err);
      failed++;
      continue;
    }
    if (!lead || lead.unsubscribed_at) {
      skipped++;
      continue;
    }

    const token = encodeURIComponent(lead.unsubscribe_token);
    const email = renderCampaignEmail({
      subject,
      body,
      direction,
      coachName: lead.full_name?.trim() || NEUTRAL_NAME[direction],
      appUrl,
      unsubscribeUrl: `${appUrl}/${linkLocale}/unsubscribe?token=${token}`,
    });
    const result = await sendBrevoMessage(brevo, {
      to: lead.email,
      ...email,
      headers: {
        // The one-click POST can't land on a page, so it has its own endpoint.
        "List-Unsubscribe": `<${appUrl}/api/unsubscribe?token=${token}&locale=${linkLocale}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    const sendError = result.error ?? null;
    if (sendError) {
      failed++;
      reason ??= sendError;
    } else sent++;

    try {
      await service.recordSend({
        leadId: lead.id,
        subject: email.subject,
        messageId: result.error === undefined ? result.messageId : null,
        error: sendError,
        sentBy: userId,
      });
      if (!sendError) await service.markContacted(lead, new Date());
    } catch (err) {
      // The email is already out; keep sending and keep the counts right.
      console.error("lead email: logging send failed", lead.id, err);
    }
  }

  revalidatePath(`/${locale}/admin/emails`);
  revalidatePath(`/${locale}/admin/leads`);
  return { sent, failed, skipped, reason };
}
