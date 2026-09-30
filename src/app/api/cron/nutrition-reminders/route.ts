import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NutritionLogsService } from "@/domain/nutrition/nutrition-logs.service";

// Runs every 15 minutes via Vercel Cron (see vercel.json), so a reminder
// lands within 15 minutes of each client's chosen local time. Same
// admin-client justification as the other cron routes: a trusted job
// authenticated by CRON_SECRET that must read every client's reminder
// settings and insert notifications (authenticated has no insert on
// notifications). Delivery itself is the notifications cron's job.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sent = await new NutritionLogsService(createAdminClient()).sendDueReminders(new Date());
  return NextResponse.json({ sent });
}
