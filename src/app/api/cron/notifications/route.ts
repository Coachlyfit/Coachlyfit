import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextDeliveryOutcome, MAX_ATTEMPTS } from "@/domain/notifications/delivery";
import { renderNotificationEmail, type NotificationKind } from "@/domain/notifications/email-templates";
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

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "resend_not_configured" }, { status: 500 });
  const resend = new Resend(apiKey);
  const supabase = createAdminClient();

  const now = new Date();
  const { data: deliveries, error } = await supabase
    .from("notification_deliveries")
    .select(
      "id, attempts, notifications(id, kind, payload, profiles(id, full_name, locale, email_notifications))"
    )
    .eq("channel", "email")
    .eq("status", "pending")
    .lte("send_after", now.toISOString())
    .order("send_after", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let retried = 0;
  let dead = 0;
  let skipped = 0;

  for (const delivery of deliveries ?? []) {
    const notification = delivery.notifications;
    const profile = notification?.profiles;

    // Profile deleted, or email notifications turned off since this row
    // was queued — nothing to send, not a failure worth retrying.
    if (!notification || !profile || !profile.email_notifications) {
      await supabase.from("notification_deliveries").update({ status: "dead" }).eq("id", delivery.id);
      skipped++;
      continue;
    }

    const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);
    const email = authUser.user?.email;
    if (!email) {
      await supabase.from("notification_deliveries").update({ status: "dead" }).eq("id", delivery.id);
      skipped++;
      continue;
    }

    const { data: suppressed } = await supabase
      .from("email_suppressions")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (suppressed) {
      await supabase.from("notification_deliveries").update({ status: "dead" }).eq("id", delivery.id);
      skipped++;
      continue;
    }

    const payload = (notification.payload ?? {}) as Record<string, unknown>;
    const locale = profile.locale === "ar" ? "ar" : "en";
    const { subject, html } = renderNotificationEmail(
      locale,
      notification.kind as NotificationKind,
      profile.full_name,
      notification.kind === "new_message" ? null : pickLocale(payload, locale)
    );

    const { error: sendError } = await resend.emails.send({ from: FROM_ADDRESS, to: email, subject, html });

    if (!sendError) {
      await supabase.from("notification_deliveries").update({ status: "sent" }).eq("id", delivery.id);
      sent++;
      continue;
    }

    const attemptsAfterThisTry = delivery.attempts + 1;
    const outcome = nextDeliveryOutcome(attemptsAfterThisTry, now);
    await supabase
      .from("notification_deliveries")
      .update({
        attempts: attemptsAfterThisTry,
        last_error: sendError.message.slice(0, 500),
        status: outcome.status === "dead" ? "dead" : "pending",
        send_after: outcome.status === "retry" ? outcome.sendAfter.toISOString() : now.toISOString(),
      })
      .eq("id", delivery.id);
    if (outcome.status === "dead") dead++;
    else retried++;
  }

  return NextResponse.json({ checked: deliveries?.length ?? 0, sent, retried, dead, skipped, maxAttempts: MAX_ATTEMPTS });
}
