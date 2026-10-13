import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VOICE_NOTES_BUCKET, VOICE_NOTE_RETENTION_DAYS } from "@/domain/messages/voice-notes";

// Runs daily via Vercel Cron (see vercel.json). Deletes voice-note files
// past VOICE_NOTE_RETENTION_DAYS -- the message row stays and shows as
// expired -- plus files that never got a message row (an upload whose
// insert failed and was never retried). This is what keeps the bucket from
// growing without bound. Admin client: trusted internal job authenticated by
// CRON_SECRET, same reasoning as trash-cleanup.
const ORPHAN_GRACE_HOURS = 24;
const BATCH_SIZE = 100;
// ponytail: 2,000 files a run. A backlog bigger than that drains over the
// following days; raise this if daily volume ever gets near it.
const MAX_BATCHES = 20;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = Date.now();
  const before = new Date(now - VOICE_NOTE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const orphanBefore = new Date(now - ORPHAN_GRACE_HOURS * 60 * 60 * 1000).toISOString();

  let deleted = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data: paths, error } = await supabase.rpc("voice_notes_to_delete", {
      p_before: before,
      p_orphan_before: orphanBefore,
      p_limit: BATCH_SIZE,
    });
    if (error) return NextResponse.json({ error: error.message, deleted }, { status: 500 });
    if (paths.length === 0) break;

    // Row first, file second: if the removal fails, the file is still listed
    // on the next run and both steps simply repeat. The other order could
    // leave a message that looks playable with nothing behind it.
    const { error: markError } = await supabase
      .from("messages")
      .update({ audio_deleted_at: new Date().toISOString() })
      .in("audio_path", paths)
      .is("audio_deleted_at", null);
    if (markError) return NextResponse.json({ error: markError.message, deleted }, { status: 500 });

    const { error: removeError } = await supabase.storage.from(VOICE_NOTES_BUCKET).remove(paths);
    if (removeError) return NextResponse.json({ error: removeError.message, deleted }, { status: 500 });

    deleted += paths.length;
    if (paths.length < BATCH_SIZE) break;
  }

  return NextResponse.json({ deleted });
}
