import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { brevoConfig, sendBrevoEmail } from "@/lib/email/brevo";
import { formatDate } from "@/lib/format";
import { dueNudges, nudgeEmailHtml } from "@/domain/messages/message-nudge";

// Runs every 15 minutes via Supabase Cron (pg_cron + pg_net), not Vercel Cron:
// Hobby only allows daily jobs, see supabase/snippets/hobby_cron_schedules.sql.
// Same admin-client justification as the other cron routes: a trusted job
// authenticated by CRON_SECRET that reads every coach's open "unread message"
// windows (pending_coach_notifications has no authenticated policy) and their
// auth email. The windows themselves are opened and closed by triggers on
// messages (private.track_coach_unread / clear_coach_unread).
const BATCH_SIZE = 100;
// Shortest delay a coach can choose: nothing younger than this can be due.
const MIN_DELAY_MS = 30 * 60_000;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const config = brevoConfig();
  if (!config) return NextResponse.json({ sent: 0, error: "brevo_not_configured" });

  const supabase = createAdminClient();
  const now = new Date();

  const { data: rows, error } = await supabase
    .from("pending_coach_notifications")
    .select("client_id, coach_id, first_unread_at, email_sent, clients(display_name)")
    .eq("email_sent", false)
    .lte("first_unread_at", new Date(now.getTime() - MIN_DELAY_MS).toISOString())
    .order("first_unread_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) return NextResponse.json({ sent: 0, error: error.message });
  if (!rows || rows.length === 0) return NextResponse.json({ sent: 0 });

  const coachIds = [...new Set(rows.map((r) => r.coach_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, message_nudge_minutes, email_notifications, locale, timezone")
    .in("id", coachIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Off = the coach picked "no nudges" or turned all email notifications off.
  const delayByCoach = new Map(
    (profiles ?? []).map((p) => [p.id, p.email_notifications ? p.message_nudge_minutes : null] as const)
  );

  const origin = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  let sent = 0;
  let failed = 0;

  for (const row of dueNudges(rows, delayByCoach, now)) {
    const profile = profileById.get(row.coach_id);
    if (!profile) continue;

    const { data: authUser } = await supabase.auth.admin.getUserById(row.coach_id);
    const to = authUser.user?.email;
    if (!to) continue;

    const { data: suppressed } = await supabase.from("email_suppressions").select("email").eq("email", to).maybeSingle();
    if (suppressed) continue;

    // Claim first, so two overlapping runs can't both send.
    const { data: claimed, error: claimError } = await supabase
      .from("pending_coach_notifications")
      .update({ email_sent: true, email_sent_at: now.toISOString() })
      .eq("client_id", row.client_id)
      .eq("email_sent", false)
      .select("client_id");
    if (claimError || !claimed || claimed.length === 0) continue;

    const locale = profile.locale === "ar" ? "ar" : "en";
    const t = await getTranslations({ locale, namespace: "messageNudge" });
    const clientName = row.clients?.display_name ?? "";
    const since = formatDate(row.first_unread_at, locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: profile.timezone || "Africa/Cairo",
    });

    const failure = await sendBrevoEmail(config, {
      to,
      subject: t("subject", { name: clientName }),
      html: nudgeEmailHtml({
        dir: locale === "ar" ? "rtl" : "ltr",
        intro: t("intro", { name: clientName }),
        clientLabel: t("client"),
        clientName,
        sinceLabel: t("since"),
        since,
        buttonLabel: t("button"),
        url: `${origin}/${locale}/messages/${row.client_id}`,
        footer: t("footer"),
      }),
    });

    if (failure) {
      // Not delivered: reopen the window so the next run retries.
      await supabase
        .from("pending_coach_notifications")
        .update({ email_sent: false, email_sent_at: null })
        .eq("client_id", row.client_id);
      failed++;
    } else {
      sent++;
    }
  }

  return NextResponse.json({ sent, failed });
}
