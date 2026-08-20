import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

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
      }
      redirect(next);
    }
  }

  redirect("/ar/login?error=confirmation_failed");
}
