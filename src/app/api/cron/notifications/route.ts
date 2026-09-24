import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextDeliveryOutcome, MAX_ATTEMPTS } from "@/domain/notifications/delivery";
import {
  renderNotificationEmail,
  renderPushNotification,
  notificationNeedsPickedName,
  type NotificationKind,
} from "@/domain/notifications/email-templates";
import { pickLocale } from "@/domain/locale";

// Runs every 5 minutes via Vercel Cron (see vercel.json). Same admin-client
// justification as billing-lifecycle: a trusted job authenticated by
// CRON_SECRET, not a user session — the notification_deliveries queue has
// no `authenticated` policy at all, only service_role can touch it.
const BATCH_SIZE = 50;

// Sender address must live on a domain Resend has verified. Configured via
// env rather than hardcoded so swapping in a real owned domain later
// (replacing the shared onboarding.resend.dev sandbox sender, which can
// only deliver to the Resend account's own verified test addresses) is a
// one-variable change, not a code change.
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "Coachly Fit <onboarding@resend.dev>";

type Counts = { sent: number; retried: number; dead: number; skipped: number };

function emptyCounts(): Counts {
  return { sent: 0, retried: 0, dead: 0, skipped: 0 };
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const email = await processEmailBatch(supabase, now);
  const push = await processPushBatch(supabase, now);

  return NextResponse.json({ email, push, maxAttempts: MAX_ATTEMPTS });
}

async function processEmailBatch(supabase: ReturnType<typeof createAdminClient>, now: Date) {
  const counts = emptyCounts();
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ...counts, error: "resend_not_configured" };
  const resend = new Resend(apiKey);

  const { data: deliveries, error } = await supabase
    .from("notification_deliveries")
    .select("id, attempts, notifications(id, kind, payload, profiles(id, full_name, locale, email_notifications))")
    .eq("channel", "email")
    .eq("status", "pending")
    .lte("send_after", now.toISOString())
    .order("send_after", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) return { ...counts, error: error.message };

  for (const delivery of deliveries ?? []) {
    const notification = delivery.notifications;
    const profile = notification?.profiles;

    // Profile deleted, or email notifications turned off since this row
    // was queued — nothing to send, not a failure worth retrying.
    if (!notification || !profile || !profile.email_notifications) {
      await supabase.from("notification_deliveries").update({ status: "dead" }).eq("id", delivery.id);
      counts.skipped++;
      continue;
    }

    const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);
    const recipientEmail = authUser.user?.email;
    if (!recipientEmail) {
      await supabase.from("notification_deliveries").update({ status: "dead" }).eq("id", delivery.id);
      counts.skipped++;
      continue;
    }

    const { data: suppressed } = await supabase
      .from("email_suppressions")
      .select("email")
      .eq("email", recipientEmail)
      .maybeSingle();
    if (suppressed) {
      await supabase.from("notification_deliveries").update({ status: "dead" }).eq("id", delivery.id);
      counts.skipped++;
      continue;
    }

    const payload = (notification.payload ?? {}) as Record<string, unknown>;
    const locale = profile.locale === "ar" ? "ar" : "en";
    const { subject, html } = renderNotificationEmail(
      locale,
      notification.kind as NotificationKind,
      profile.full_name,
      notificationNeedsPickedName(notification.kind) ? pickLocale(payload, locale) : null
    );

    const { error: sendError } = await resend.emails.send({ from: FROM_ADDRESS, to: recipientEmail, subject, html });
    await recordOutcome(supabase, delivery.id, delivery.attempts, sendError?.message, now, counts);
  }

  return counts;
}

async function processPushBatch(supabase: ReturnType<typeof createAdminClient>, now: Date) {
  const counts = emptyCounts();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return { ...counts, error: "vapid_not_configured" };
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const { data: deliveries, error } = await supabase
    .from("notification_deliveries")
    .select("id, attempts, notifications(id, kind, payload, profiles(id, full_name, locale))")
    .eq("channel", "push")
    .eq("status", "pending")
    .lte("send_after", now.toISOString())
    .order("send_after", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) return { ...counts, error: error.message };

  for (const delivery of deliveries ?? []) {
    const notification = delivery.notifications;
    const profile = notification?.profiles;
    if (!notification || !profile) {
      await supabase.from("notification_deliveries").update({ status: "dead" }).eq("id", delivery.id);
      counts.skipped++;
      continue;
    }

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("profile_id", profile.id);
    if (!subscriptions || subscriptions.length === 0) {
      await supabase.from("notification_deliveries").update({ status: "dead" }).eq("id", delivery.id);
      counts.skipped++;
      continue;
    }

    const payload = (notification.payload ?? {}) as Record<string, unknown>;
    const locale = profile.locale === "ar" ? "ar" : "en";
    const { title, body } = renderPushNotification(
      locale,
      notification.kind as NotificationKind,
      notificationNeedsPickedName(notification.kind) ? pickLocale(payload, locale) : null
    );
    const message = JSON.stringify({ title, body, url: "/" });

    // One delivery row can fan out to several devices — a dead endpoint
    // (410/404, browser unsubscribed without telling us) is pruned rather
    // than left to error forever; the delivery only fails if every
    // subscription failed for a reason other than "gone".
    let anySucceeded = false;
    let lastError: string | undefined;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message
        );
        anySucceeded = true;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          continue;
        }
        lastError = err instanceof Error ? err.message : "push_send_failed";
      }
    }

    await recordOutcome(supabase, delivery.id, delivery.attempts, anySucceeded ? undefined : lastError, now, counts, {
      // A delivery with zero subscriptions left standing (all pruned as
      // gone) has nothing left to retry — treat it as sent, not dead/retry.
      allPruned: subscriptions.length > 0 && !anySucceeded && !lastError,
    });
  }

  return counts;
}

async function recordOutcome(
  supabase: ReturnType<typeof createAdminClient>,
  deliveryId: string,
  attempts: number,
  errorMessage: string | undefined,
  now: Date,
  counts: Counts,
  opts?: { allPruned?: boolean }
) {
  if (!errorMessage) {
    await supabase.from("notification_deliveries").update({ status: opts?.allPruned ? "dead" : "sent" }).eq("id", deliveryId);
    counts.sent++;
    return;
  }

  const attemptsAfterThisTry = attempts + 1;
  const outcome = nextDeliveryOutcome(attemptsAfterThisTry, now);
  await supabase
    .from("notification_deliveries")
    .update({
      attempts: attemptsAfterThisTry,
      last_error: errorMessage.slice(0, 500),
      status: outcome.status === "dead" ? "dead" : "pending",
      send_after: outcome.status === "retry" ? outcome.sendAfter.toISOString() : now.toISOString(),
    })
    .eq("id", deliveryId);
  if (outcome.status === "dead") counts.dead++;
  else counts.retried++;
}
