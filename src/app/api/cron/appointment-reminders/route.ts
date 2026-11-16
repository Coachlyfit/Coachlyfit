import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron-auth";
import { AppointmentReminders } from "@/domain/appointments/reminders";

// Every 15 minutes via Supabase Cron (supabase/snippets/hobby_cron_schedules.sql):
// Vercel Hobby only allows daily crons. Admin client for the same reason as the
// other cron routes: a trusted job authenticated by CRON_SECRET that writes
// notifications for other people.
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sent = await new AppointmentReminders(createAdminClient()).sendDue(new Date());
  return NextResponse.json({ sent });
}
