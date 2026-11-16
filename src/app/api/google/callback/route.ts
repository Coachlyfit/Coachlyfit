import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getRequestCoachId } from "@/lib/auth/session";
import { emailFromIdToken, exchangeCode, revokeToken, statesMatch, STATE_COOKIE } from "@/lib/google/oauth";
import { GoogleConnectionService } from "@/domain/google/connection.service";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/domain/appointments/tz";

const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

// OAuth redirect URI (GOOGLE_CLIENT_ID's console entry must be
// <app url>/api/google/callback). Verifies the CSRF state, re-checks the
// caller is the signed-in owner, then hands the tokens to the connection
// service, which encrypts the refresh token and stores it through the
// google_connect RPC under the caller's own session (no admin client).
// Nothing sensitive is logged: a failure only redirects back with a status word.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const [cookieState, cookieLocale] = (request.cookies.get(STATE_COOKIE)?.value ?? "").split(":");
  const locale = cookieLocale === "en" ? "en" : "ar";

  const finish = (status: string) => {
    const response = NextResponse.redirect(new URL(`/${locale}/settings/schedule?google=${status}`, request.url));
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/google" });
    return response;
  };

  if (params.get("error")) return finish(params.get("error") === "access_denied" ? "denied" : "failed");
  if (!statesMatch(cookieState, params.get("state"))) return finish("state");

  const code = params.get("code");
  const [user, coachId] = await Promise.all([getAuthUser(), getRequestCoachId()]);
  if (!code || !user || !coachId || user.id !== coachId) return finish("forbidden");

  let refreshToken: string | undefined;
  try {
    const supabase = await createClient();
    const [{ data: features }, { data: profile }] = await Promise.all([
      supabase.rpc("get_my_features"),
      supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle(),
    ]);
    if ((features as Record<string, unknown> | null)?.appointments !== true) return finish("upgrade");

    const tokens = await exchangeCode(code);
    refreshToken = tokens.refresh_token;
    const scopes = (tokens.scope ?? "").split(" ").filter(Boolean);
    // The consent screen lets a user untick scopes: without these, nothing works.
    if (!refreshToken || !REQUIRED_SCOPES.every((scope) => scopes.includes(scope))) {
      if (refreshToken) await revokeToken(refreshToken).catch(() => undefined);
      return finish("scopes");
    }

    await new GoogleConnectionService(supabase).connect({
      accessToken: tokens.access_token,
      refreshToken,
      scopes,
      email: emailFromIdToken(tokens.id_token),
      timeZone: profile?.timezone && isValidTimeZone(profile.timezone) ? profile.timezone : DEFAULT_TIME_ZONE,
    });
    return finish("connected");
  } catch {
    // Don't keep a grant we failed to store.
    if (refreshToken) await revokeToken(refreshToken).catch(() => undefined);
    return finish("failed");
  }
}
