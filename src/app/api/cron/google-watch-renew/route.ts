import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron-auth";
import { createAccessProvider } from "@/domain/google/access";
import { GoogleWatchService } from "@/domain/google/watch.service";

// Daily (vercel.json): Google notification channels expire after about a week,
// so renew any that are within two days of it. The 3-minute google-sync run does
// the same check; this is the safety net the schedule promises, and it works on
// a plan that only allows daily crons.
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const origin = (process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") || request.nextUrl.origin).toString();
  try {
    return NextResponse.json(await new GoogleWatchService(db, createAccessProvider(db), origin).ensure());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.name : "failed" }, { status: 500 });
  }
}
