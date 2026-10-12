import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dueReminder, groupTransitions, type NoticeKind, type SubscriptionLike } from "@/domain/billing/lifecycle";
import { shouldTriggerCheckin } from "@/domain/programs/lifecycle";

// Runs daily via Vercel Cron (see vercel.ts). Uses the admin (service_role)
// client deliberately — this is a trusted internal job authenticated by
// CRON_SECRET, not a user session, so it bypasses RLS by design rather
// than needing an admin user policy for what is a system process.
//
// One failed write never stops the run: it is logged (error code and counts
// only, no ids or emails), counted in `failed`, and the rest carries on. The
// job is idempotent, so whatever failed is picked up by the next run.
type AdminClient = ReturnType<typeof createAdminClient>;

/** true = queued now, false = already sent for this period, null = failed. */
async function queueNotice(
  supabase: AdminClient,
  subscriptionId: string,
  kind: NoticeKind,
  periodEnd: string
): Promise<boolean | null> {
  // ponytail: queue_subscription_notice (20261017000003) isn't in the
  // generated types until that migration is applied and the types are
  // regenerated. Drop both casts then.
  const { data, error } = await supabase.rpc(
    "queue_subscription_notice" as never,
    { p_subscription_id: subscriptionId, p_kind: kind, p_period_end: periodEnd } as never
  );
  if (error) {
    console.error("subscription notice failed", { code: error.code, kind });
    return null;
  }
  return data === true;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: subscriptions, error } = await supabase
    .from("subscriptions")
    .select("id, status, trial_ends_at, current_period_end, cancel_at_period_end")
    .neq("status", "canceled");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date();
  const subs = (subscriptions ?? []) as (SubscriptionLike & { id: string })[];
  let transitioned = 0;
  let failed = 0;
  let noticesQueued = 0;

  // One update per target status rather than one per subscription.
  for (const [next, group] of Object.entries(groupTransitions(subs, now))) {
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({ status: next })
      .in(
        "id",
        group.map((t) => t.sub.id)
      );
    if (updateError) {
      console.error("subscription transition failed", { code: updateError.code, status: next, count: group.length });
      failed += group.length;
      continue;
    }
    transitioned += group.length;

    // Only after the status really changed. Both targets ("past_due",
    // "canceled") are notice kinds.
    for (const { sub, periodEnd } of group) {
      const queued = await queueNotice(supabase, sub.id, next as NoticeKind, periodEnd);
      if (queued === null) failed++;
      else if (queued) noticesQueued++;
    }
  }

  // "Ends in 3 days" reminders. A subscription that just transitioned is
  // past its deadline, so dueReminder() skips it by itself.
  for (const sub of subs) {
    const reminder = dueReminder(sub, now);
    if (!reminder) continue;
    const queued = await queueNotice(supabase, sub.id, reminder.kind, reminder.periodEnd);
    if (queued === null) failed++;
    else if (queued) noticesQueued++;
  }

  // After the transitions, so this month's row reflects today's statuses.
  // Feeds the admin home's MRR chart; a failed write only costs one day's
  // refresh of the current month, so it doesn't fail the job.
  const { error: snapshotError } = await supabase.rpc("snapshot_mrr");
  if (snapshotError) console.error("mrr snapshot failed", { code: snapshotError.code });

  // Plan lifecycle: a program past its end_date auto-sends the coach's
  // designated check-in form, closing the loop that otherwise depends on
  // the coach remembering. `checkin_triggered_at is null` bounds the scan to
  // programs not yet processed; shouldTriggerCheckin (not the SQL filter)
  // is the actual "is this due" decision, so the date logic lives in one
  // place. A coach with no default_checkin_template_id configured still
  // gets checkin_triggered_at stamped, so the row drops out of future scans
  // instead of being retried forever — no auto-send is the expected
  // behavior for a coach who hasn't set one up, not an error.
  const { data: candidates, error: programsError } = await supabase
    .from("programs")
    .select("id, client_id, end_date, checkin_triggered_at, coaches(default_checkin_template_id)")
    .not("client_id", "is", null)
    .not("end_date", "is", null)
    .is("checkin_triggered_at", null);
  if (programsError) return NextResponse.json({ error: programsError.message }, { status: 500 });

  let checkinsTriggered = 0;
  for (const program of candidates ?? []) {
    if (!shouldTriggerCheckin(program, now)) continue;

    const templateId = program.coaches?.default_checkin_template_id;
    if (templateId) {
      const { data: template } = await supabase
        .from("form_templates")
        .select("coach_id, current_version_id")
        .eq("id", templateId)
        .is("archived_at", null)
        .maybeSingle();
      if (template?.current_version_id) {
        const { error: assignError } = await supabase.from("form_assignments").insert({
          coach_id: template.coach_id,
          client_id: program.client_id!,
          template_version_id: template.current_version_id,
        });
        if (assignError) {
          // Not stamped below, so the next run retries this program.
          console.error("check-in auto-assign failed", { code: assignError.code });
          failed++;
          continue;
        }
        checkinsTriggered++;
      }
    }

    const { error: stampError } = await supabase
      .from("programs")
      .update({ checkin_triggered_at: now.toISOString() })
      .eq("id", program.id);
    if (stampError) {
      console.error("check-in stamp failed", { code: stampError.code });
      failed++;
    }
  }

  return NextResponse.json({
    checked: subs.length,
    transitioned,
    failed,
    noticesQueued,
    checkinsTriggered,
  });
}
