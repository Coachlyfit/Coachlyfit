import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Readable (not httpOnly) so the coach layout's client-side banner can show
// "you're impersonating" without a round trip — this cookie carries no
// authority of its own, it's purely a display hint. The real audit trail is
// impersonation_log, written inside begin_impersonation() before this route
// ever runs. Short-lived: a stale banner outliving the session it describes
// would be misleading.
const IMPERSONATING_COOKIE = "impersonating";
const IMPERSONATING_MAX_AGE_S = 60 * 60 * 4;

// Locale-agnostic on purpose: this is the fixed URL a real Supabase
// project's confirmation email points to (via emailRedirectTo), so it must
// stay outside the [locale] prefix and outside the i18n proxy's matcher —
// see src/proxy.ts. `next` carries the locale-prefixed destination.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/ar/dashboard";
  const inviteToken = searchParams.get("invite_token");
  const teamInviteToken = searchParams.get("team_invite_token");
  const impersonating = searchParams.get("impersonating") === "1";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // Client invite signups only get their coach link on confirmation
      // when email confirmations are on — the immediate-session case is
      // already handled in join/[token]/actions.ts.
      if (inviteToken) {
        const { error: acceptError } = await supabase.rpc("accept_invite", {
          p_token: inviteToken,
        });
        if (acceptError) {
          redirect(`/ar/join/${inviteToken}?error=invalid_invite`);
        }
      } else if (next.includes("/c") && !impersonating) {
        // A client-invite confirm link should always carry invite_token
        // (embedded in emailRedirectTo at signup). If it's missing here,
        // Supabase's redirect allow-list likely doesn't match the exact
        // emailRedirectTo URL and stripped the query string — the account
        // still gets confirmed/logged in, but the client never gets linked
        // to their coach and stays stuck on status='invited' with no error
        // anywhere. Log loud so this isn't silent next time.
        console.error(
          "[auth/confirm] client login confirmed with no invite_token — check Supabase Auth redirect URL allow-list matches emailRedirectTo exactly",
          { next }
        );
      }
      // Team invite signups only get their coach link on confirmation when
      // email confirmations are on — the immediate-session case is already
      // handled in join-team/[token]/actions.ts.
      if (teamInviteToken) {
        const { error: acceptError } = await supabase.rpc("accept_team_invite", {
          p_token: teamInviteToken,
        });
        if (acceptError) {
          redirect(`/ar/join-team/${teamInviteToken}?error=invalid_invite`);
        }
      }
      const cookieStore = await cookies();
      if (impersonating) {
        cookieStore.set(IMPERSONATING_COOKIE, "1", {
          maxAge: IMPERSONATING_MAX_AGE_S,
          path: "/",
          sameSite: "lax",
        });
      } else {
        // Defensive: any other confirm-route sign-in (a real magic link,
        // once/if that ever ships) must not inherit a stale "1" from an
        // earlier impersonation session on this device.
        cookieStore.delete(IMPERSONATING_COOKIE);
      }
      redirect(next);
    }
  }

  redirect("/ar/login?error=confirmation_failed");
}
