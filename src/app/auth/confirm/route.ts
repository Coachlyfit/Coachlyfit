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
  const code = searchParams.get("code");
  const inviteToken = searchParams.get("invite_token");
  const impersonating = searchParams.get("impersonating") === "1";

  // Two ways in: a token_hash (admin impersonation magic link) or a PKCE
  // `code` -- what Supabase's own /verify redirect sends for the default
  // signup-confirmation email. Handling only the first made every confirmation
  // email land on confirmation_failed.
  if ((tokenHash && type) || code) {
    const supabase = await createClient();
    const { error } =
      tokenHash && type
        ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
        : await supabase.auth.exchangeCodeForSession(code!);
    if (!error) {
      // handle_new_user() already links a client-invite signup at signup
      // time (see 20260922000001_link_client_invite_on_signup.sql), so by
      // the time a confirm link is clicked this call almost always finds
      // accepted_at already set and raises P0002 "already been used" — not
      // a real failure. This RPC only still does real work for a user
      // created before that migration shipped. Don't bounce a confirmed
      // user to a dead join link over an already-linked invite; just log.
      if (inviteToken) {
        const { error: acceptError } = await supabase.rpc("accept_invite", {
          p_token: inviteToken,
        });
        if (acceptError) {
          console.error("[auth/confirm] accept_invite failed (likely already linked)", {
            inviteToken,
            error: acceptError,
          });
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
      // Team-invite signups are linked by handle_new_user() at signup time
      // (team_invite_token_hash in the metadata), so there's nothing to accept
      // here -- confirming the email only signs the user in.
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
