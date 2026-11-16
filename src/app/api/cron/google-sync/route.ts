import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron-auth";
import { decryptToken } from "@/lib/crypto/token-crypto";
import { GoogleApiError } from "@/lib/google/errors";
import { createEventsApi } from "@/lib/google/events-api";
import { refreshAccessToken } from "@/lib/google/oauth";
import { GoogleSyncService } from "@/domain/google/sync.service";

// Every 3 minutes via Supabase Cron (supabase/snippets/hobby_cron_schedules.sql):
// Vercel Hobby only allows daily crons. Service role because the sync queue and
// the stored tokens have no user policies at all. Tokens are decrypted here, in
// memory, only for the duration of the run, and are never logged.
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const service = new GoogleSyncService(db, async (coachId) => {
    const { data: connection } = await db
      .from("google_connections")
      .select("encrypted_refresh_token, calendar_id")
      .eq("coach_id", coachId)
      .eq("status", "active")
      .maybeSingle();
    // Disconnected or flagged since the job was claimed: same as a dead grant.
    if (!connection) throw new GoogleApiError(400, "invalid_grant");
    const accessToken = await refreshAccessToken(decryptToken(connection.encrypted_refresh_token));
    return createEventsApi(accessToken, connection.calendar_id);
  });

  try {
    return NextResponse.json(await service.run());
  } catch (error) {
    // Say what failed, never the details that might carry a secret.
    return NextResponse.json({ error: error instanceof Error ? error.name : "sync_failed" }, { status: 500 });
  }
}
