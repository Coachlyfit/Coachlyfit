import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildIcs, icsStatus } from "@/domain/appointments/ics";
import { appointmentSummary } from "@/domain/appointments/labels";

// A calendar app subscribes to this URL, so there is no session: the secret
// token in the path is the credential. It goes through the calendar_feed RPC
// (security definer, display-safe columns only) rather than the admin client.
// /api is excluded from the proxy, so nothing else runs before this.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  if (token.length < 32 || token.length > 128) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calendar_feed", { p_token: token });
  if (error) return new NextResponse("Unavailable", { status: 503 });
  if (!data || data.length === 0) {
    // An unknown token and an empty calendar look the same on purpose; an
    // empty valid feed is still a valid calendar.
    return calendarResponse(buildIcs([], { calName: "Coachly Fit" }));
  }

  const locale = data[0].viewer_locale === "en" ? "en" : "ar";
  const ics = buildIcs(
    data.map((row) => ({
      id: row.id,
      start: new Date(row.starts_at),
      end: new Date(row.ends_at),
      summary: appointmentSummary({
        locale,
        viewer: row.viewer_role === "client" ? "client" : "coach",
        name: row.counterpart_name,
        type: row.type,
      }),
      location: row.location_or_link,
      status: icsStatus(row.status),
    })),
    { calName: "Coachly Fit" }
  );
  return calendarResponse(ics);
}

function calendarResponse(body: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="coachlyfit.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
