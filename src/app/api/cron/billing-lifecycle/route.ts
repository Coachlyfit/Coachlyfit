import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextStatus, type SubscriptionLike } from "@/domain/billing/lifecycle";
import { shouldTriggerCheckin } from "@/domain/programs/lifecycle";

// Runs daily via Vercel Cron (see vercel.ts). Uses the admin (service_role)
// client deliberately — this is a trusted internal job authenticated by
// CRON_SECRET, not a user session, so it bypasses RLS by design rather
// than needing an admin user policy for what is a system process.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: subscriptions, error } = await supabase
    .from("subscriptions")
    .select("id, status, trial_ends_at, current_period_end")
    .neq("status", "canceled");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date();
  const transitions = (subscriptions ?? [])
    .map((sub) => ({ id: sub.id, next: nextStatus(sub as SubscriptionLike, now) }))
    .filter((t): t is { id: string; next: NonNullable<typeof t.next> } => t.next !== null);

  for (const { id, next } of transitions) {
    await supabase.from("subscriptions").update({ status: next }).eq("id", id);
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
        await supabase.from("form_assignments").insert({
          coach_id: template.coach_id,
          client_id: program.client_id!,
          template_version_id: template.current_version_id,
        });
        checkinsTriggered++;
      }
    }

    await supabase.from("programs").update({ checkin_triggered_at: now.toISOString() }).eq("id", program.id);
  }

  return NextResponse.json({
    checked: subscriptions?.length ?? 0,
    transitioned: transitions.length,
    checkinsTriggered,
  });
}
