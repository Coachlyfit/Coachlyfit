import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Runs daily via Vercel Cron (see vercel.json). Hard-deletes rows a coach
// soft-deleted (archived_at) over 30 days ago -- the trash UI only offers
// restore up to that point, this is what actually reclaims the storage.
// Admin client: trusted internal job authenticated by CRON_SECRET, not a
// user session, same reasoning as billing-lifecycle.
const RETENTION_DAYS = 30;
const TABLES = ["programs", "exercises", "diet_plans"] as const;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const deleted: Record<string, number> = {};
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).delete().lt("archived_at", cutoff).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    deleted[table] = data?.length ?? 0;
  }

  return NextResponse.json({ deleted });
}
