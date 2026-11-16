import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron-auth";
import { createEventsApi } from "@/lib/google/events-api";
import { createAccessProvider } from "@/domain/google/access";
import { GoogleBusyService } from "@/domain/google/busy.service";
import { GooglePullService } from "@/domain/google/pull.service";
import { GoogleSyncService } from "@/domain/google/sync.service";
import { GoogleWatchService } from "@/domain/google/watch.service";

// Every 3 minutes via Supabase Cron (supabase/snippets/hobby_cron_schedules.sql),
// and right after a Google webhook (the webhook calls this route itself):
// Vercel Hobby only allows daily crons. Service role because the queue, the
// watch channels and the stored tokens have no user policies at all. Tokens are
// decrypted here, in memory, once per coach per run, and are never logged.
//
// Four stages, each isolated so one failing doesn't skip the rest:
//   push   queued appointment changes -> the coach's Google calendar
//   watch  make sure each connection has a live notification channel
//   pull   changes the coach made in Google -> reschedule requests / cancellations
//   busy   the coach's other Google commitments -> blocked booking slots
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const access = createAccessProvider(db);
  const origin = (process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") || request.nextUrl.origin).toString();

  // Say which stage failed, never the details (they might carry a secret).
  async function stage<T>(run: () => Promise<T>): Promise<T | { error: string }> {
    try {
      return await run();
    } catch (error) {
      return { error: error instanceof Error ? error.name : "failed" };
    }
  }

  const push = await stage(() =>
    new GoogleSyncService(db, async (coachId) => {
      const { accessToken, calendarId } = await access(coachId);
      return createEventsApi(accessToken, calendarId);
    }).run()
  );
  const watch = await stage(() => new GoogleWatchService(db, access, origin).ensure());
  const pull = await stage(() => new GooglePullService(db, access).run());
  const busy = await stage(() => new GoogleBusyService(db, access).refreshAll());

  return NextResponse.json({ push, watch, pull, busy });
}
