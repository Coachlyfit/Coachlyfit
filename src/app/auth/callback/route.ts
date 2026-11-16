import { NextResponse, type NextRequest } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformSettings } from "@/lib/platform-settings";
import { appOrigin } from "@/lib/app-origin";
import {
  OAUTH_COOKIE,
  handleOAuthCallback,
  oauthIntentSchema,
} from "@/lib/auth/oauth-callback";

// Supabase's Google provider redirects here (see startGoogleAuthAction). Lives
// outside [locale] and the i18n proxy like /auth/confirm, so locale and intent
// come from the httpOnly cookie the action set. All branching is in
// handleOAuthCallback (unit-tested); this is only the I/O wiring.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cookieStore = await cookies();

  const raw = cookieStore.get(OAUTH_COOKIE)?.value;
  let parsedCookie: unknown = null;
  try {
    parsedCookie = raw ? JSON.parse(raw) : null;
  } catch {
    parsedCookie = null;
  }
  const intent = oauthIntentSchema.safeParse(parsedCookie);
  cookieStore.delete({ name: OAUTH_COOKIE, path: "/auth" });

  const supabase = await createClient();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();

  const path = await handleOAuthCallback(
    {
      code: searchParams.get("code"),
      providerError: searchParams.get("error"),
      intent: intent.success ? intent.data : null,
    },
    {
      exchangeCode: (code) => supabase.auth.exchangeCodeForSession(code),
      getUser: async () => (await supabase.auth.getUser()).data.user,
      getProfile: async (id) =>
        (
          await supabase
            .from("profiles")
            .select("role, suspended_at, terms_accepted_at")
            .eq("id", id)
            .single()
        ).data,
      signupsEnabled: async () => (await getPlatformSettings()).platform.signups_enabled,
      // rpc() returns a thenable builder, not a Promise: await to satisfy the deps types.
      finalize: async ({ terms, locale, inviteToken }) =>
        await supabase.rpc("finalize_oauth_signup", {
          p_terms_version: terms,
          p_locale: locale,
          p_invite_token: inviteToken,
          p_ip: ip,
        }),
      acceptTeamInvite: async (token) => await supabase.rpc("accept_team_invite", { p_token: token, p_ip: ip }),
      // Auth Admin API only (permitted use of service_role), and only reachable
      // through cleanupFreshUser's just-created / sole-Google-identity guards.
      deleteUser: (id) => createAdminClient().auth.admin.deleteUser(id),
      signOut: async () => {
        await supabase.auth.signOut();
      },
      now: () => Date.now(),
    }
  );

  // A real login must never inherit a stale impersonation banner (same as
  // signInAction and /auth/confirm).
  cookieStore.delete("impersonating");

  return NextResponse.redirect(new URL(path, (await appOrigin()) || request.url));
}
