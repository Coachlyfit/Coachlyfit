import { after, NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google calls this when the coach's "Coachly Fit" calendar changes. There is
// no user session and no body worth reading: the request is trusted only if its
// channel id + secret token match a channel we created (checked by the
// google_webhook_ping RPC, which also marks the channel dirty). /api skips the
// proxy, so nothing else runs first.
//
// The actual fetch-changes-with-syncToken work happens in the google-sync run.
// To not wait for the next 3-minute tick, kick that run off right after
// answering (it is CRON_SECRET protected; we have the secret, Google doesn't).
export async function POST(request: NextRequest) {
  const channelId = request.headers.get("x-goog-channel-id");
  const token = request.headers.get("x-goog-channel-token");
  if (!channelId || !token) return new NextResponse(null, { status: 400 });

  const supabase = await createClient();
  const { data: known, error } = await supabase.rpc("google_webhook_ping", { p_channel_id: channelId, p_token: token });
  // A database hiccup: non-2xx makes Google retry later.
  if (error) return new NextResponse(null, { status: 503 });
  // Not a channel of ours (or the secret is wrong): 404 tells Google to stop.
  if (!known) return new NextResponse(null, { status: 404 });

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const origin = request.nextUrl.origin;
    after(async () => {
      try {
        await fetch(`${origin}/api/cron/google-sync`, { headers: { authorization: `Bearer ${secret}` } });
      } catch {
        // The 3-minute cron picks the dirty channel up anyway.
      }
    });
  }
  return new NextResponse(null, { status: 200 });
}
