"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { LEGAL_VERSION } from "@/content/legal/constants";
import { hashInviteToken } from "@/domain/clients/invites.service";
import type { Database } from "@/lib/supabase/database.types";
import { loginSchema } from "../../schemas";
import { joinSchema } from "./schemas";

type ActionResult = { error: string } | void;

// accept_team_invite() -> private.claim_team_invite() is the single accept
// rule (token, expiry, single use, email match, seat cap, empty-workspace
// archive). Hints map to distinct messages; anything else is a dead link.
const HINT_ERRORS: Record<string, string> = {
  team_limit_reached: "team_full",
  email_mismatch: "team_wrong_email",
  owns_business: "team_owns_business",
};

async function accept(supabase: SupabaseClient<Database>, token: string): Promise<string | null> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  const { error } = await supabase.rpc("accept_team_invite", { p_token: token, p_ip: ip });
  if (!error) return null;
  return HINT_ERRORS[error.hint ?? ""] ?? "invalid_invite";
}

/** New account. The invite is linked inside handle_new_user() (same
 * transaction as the signup) via the hash in the metadata -- the coach is
 * resolved from the invite row server-side, never from anything sent here. A
 * bad / expired / reused / wrong-email invite makes the signup itself fail, so
 * no stray account is left behind. */
export async function acceptTeamInviteSignupAction(
  locale: string,
  token: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = joinSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const { fullName, email, password } = parsed.data;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: "coach",
        team_invite: true,
        team_invite_token_hash: hashInviteToken(token),
        full_name: fullName,
        locale,
        terms_version: LEGAL_VERSION,
      },
      emailRedirectTo: `${appUrl}/auth/confirm?next=/${locale}/dashboard`,
    },
  });
  if (error) {
    if (error.code === "user_already_exists") return { error: "email_taken" };
    // handle_new_user() raises P0002 for a rejected invite; supabase-js
    // surfaces any trigger failure as a generic database error.
    return { error: error.code === "unexpected_failure" ? "invalid_invite" : "signup_failed" };
  }

  // Confirmations off: session exists, go straight in. On: the invite is
  // already linked, the user just confirms their email.
  if (data.session) redirect(`/${locale}/dashboard`);
  redirect(`/${locale}/signup/check-email`);
}

/** Existing account, signed out: sign in, then accept. */
export async function acceptTeamInviteLoginAction(
  locale: string,
  token: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "invalid_credentials" };

  const acceptError = await accept(supabase, token);
  if (acceptError) return { error: acceptError };
  redirect(`/${locale}/dashboard`);
}

/** Existing account, already signed in. */
export async function acceptTeamInviteAction(locale: string, token: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const acceptError = await accept(supabase, token);
  if (acceptError) return { error: acceptError };
  redirect(`/${locale}/dashboard`);
}
