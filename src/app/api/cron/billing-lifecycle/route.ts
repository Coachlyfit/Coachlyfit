import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextStatus, type SubscriptionLike } from "@/domain/billing/lifecycle";

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

  return NextResponse.json({ checked: subscriptions?.length ?? 0, transitioned: transitions.length });
}
