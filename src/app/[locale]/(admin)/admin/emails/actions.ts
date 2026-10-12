"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Resend } from "resend";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { routing } from "@/i18n/routing";
import { renderCampaignEmail } from "@/domain/emails/campaign-email";
import { CampaignsService, type RecipientResult } from "@/domain/emails/campaigns.service";
import { selectRecipients } from "@/domain/emails/recipients";
import { campaignSchema, testEmailSchema } from "./schemas";

// Same sender config as the notifications cron (api/cron/notifications).
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "Coachly Fit <onboarding@resend.dev>";

// Resend's batch endpoint takes up to 100 emails per call, each with its own
// `to`, so no recipient ever sees another one. The pause keeps consecutive
// calls under the API rate limit (2 requests/second by default).
const BATCH_SIZE = 100;
const BATCH_PAUSE_MS = 600;

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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "email_not_configured" };

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

  const { error: sendError } = await new Resend(apiKey).emails.send({
    from: FROM_ADDRESS,
    to: user.email,
    subject: `${t("testPrefix")} ${subject}`,
    html,
  });
  if (sendError) return { error: "send_failed" };
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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "email_not_configured" };

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

  const resend = new Resend(apiKey);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  let sent = 0;
  let failed = 0;

  for (let start = 0; start < recipients.length; start += BATCH_SIZE) {
    if (start > 0) await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));

    const chunk = recipients.slice(start, start + BATCH_SIZE);
    const emails = chunk.map((recipient) => ({
      from: FROM_ADDRESS,
      to: recipient.email,
      ...renderCampaignEmail({
        subject,
        body,
        direction,
        coachName: recipient.ownerName ?? recipient.businessName,
        appUrl,
      }),
    }));

    // A failed call fails the whole chunk; in permissive mode a call that
    // succeeds still lists the individual emails Resend rejected.
    let chunkError: string | null = null;
    const rejected = new Map<number, string>();
    try {
      const response = await resend.batch.send(emails, {
        batchValidation: "permissive",
        // Resend drops a repeated request with the same key, so a retried
        // action can't deliver the same chunk twice.
        idempotencyKey: `campaign/${campaignId}/${start / BATCH_SIZE}`,
      });
      if (response.error) chunkError = response.error.message;
      for (const item of response.data?.errors ?? []) rejected.set(item.index, item.message);
    } catch (err) {
      chunkError = err instanceof Error ? err.message : "send_failed";
    }

    const results: RecipientResult[] = chunk.map((recipient, index) => ({
      coachId: recipient.coachId,
      email: recipient.email,
      error: chunkError ?? rejected.get(index) ?? null,
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
