import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Runs hourly via Supabase Cron (supabase/snippets/hobby_cron_schedules.sql;
// Vercel Hobby only allows daily crons). When a client withdraws
// consent, the database unpublishes their result at once and queues the public
// photo copies in site_results.purge_paths; the client can't delete storage
// objects themselves, so this job does. Admin client: a trusted internal job
// authenticated by CRON_SECRET (same reasoning as trash-cleanup).
const BUCKET = "site-results";
const MAX_ROWS = 200;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("site_results")
    .select("site_id, card_id, purge_paths")
    .not("purge_paths", "eq", "{}")
    .limit(MAX_ROWS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let removed = 0;
  for (const row of rows) {
    // File first, row second: if the removal fails the paths stay queued and
    // the next run retries. The other order could leave a public photo with
    // nothing left to remember it by.
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(row.purge_paths);
    if (removeError) continue;
    const { error: clearError } = await supabase
      .from("site_results")
      .update({ purge_paths: [] })
      .eq("site_id", row.site_id)
      .eq("card_id", row.card_id);
    if (!clearError) removed += row.purge_paths.length;
  }

  return NextResponse.json({ removed });
}
