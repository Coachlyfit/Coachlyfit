import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildIcs, icsStatus } from "@/domain/appointments/ics";
import { appointmentSummary } from "@/domain/appointments/labels";

// "Add to calendar" for one appointment. The session cookie + RLS decide
// whether the caller can see the row at all; /api skips the proxy, so this
// authenticates itself.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const [{ data: row }, { data: profile }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, starts_at, ends_at, type, status, location_or_link, client:clients(display_name, profile_id), coach:coaches(business_name)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("profiles").select("locale").eq("id", user.id).maybeSingle(),
  ]);
  if (!row) return new NextResponse("Not found", { status: 404 });

  const viewer = row.client?.profile_id === user.id ? "client" : "coach";
  const ics = buildIcs(
    [
      {
        id: row.id,
        start: new Date(row.starts_at),
        end: new Date(row.ends_at),
        summary: appointmentSummary({
          locale: profile?.locale === "en" ? "en" : "ar",
          viewer,
          name: viewer === "client" ? (row.coach?.business_name ?? null) : (row.client?.display_name ?? null),
          type: row.type,
        }),
        location: row.location_or_link,
        status: icsStatus(row.status),
      },
    ],
    { calName: "Coachly Fit" }
  );

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="session.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
