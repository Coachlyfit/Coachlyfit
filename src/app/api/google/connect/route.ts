import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getRequestCoachId } from "@/lib/auth/session";
import { buildAuthUrl, newState, redirectUri, STATE_COOKIE, STATE_TTL_SECONDS } from "@/lib/google/oauth";

// Starts the Google OAuth flow. /api skips the proxy (no locale, no session
// refresh), so this checks the session itself: only the signed-in tenant owner
// on a plan with scheduling can connect a calendar.
export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") === "en" ? "en" : "ar";
  const back = (status: string) =>
    NextResponse.redirect(new URL(`/${locale}/settings/schedule?google=${status}`, request.url));

  const [user, coachId] = await Promise.all([getAuthUser(), getRequestCoachId()]);
  if (!user || !coachId || user.id !== coachId) return back("forbidden");

  const supabase = await createClient();
  const { data: features } = await supabase.rpc("get_my_features");
  if ((features as Record<string, unknown> | null)?.appointments !== true) return back("upgrade");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) return back("not_configured");

  const state = newState();
  const response = NextResponse.redirect(buildAuthUrl({ clientId, redirectUri: redirectUri(request.nextUrl.origin), state }));
  response.cookies.set(STATE_COOKIE, `${state}:${locale}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax, not Strict: the cookie must come back on Google's top-level redirect.
    sameSite: "lax",
    path: "/api/google",
    maxAge: STATE_TTL_SECONDS,
  });
  return response;
}
