"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { LEGAL_VERSION } from "@/content/legal/constants";
import { joinSchema } from "./schemas";

type ActionResult = { error: string } | void;

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
      data: { role: "coach", team_invite: true, full_name: fullName, locale, terms_version: LEGAL_VERSION },
      emailRedirectTo: `${appUrl}/auth/confirm?next=/${locale}/dashboard&team_invite_token=${token}`,
    },
  });
  if (error) {
    return { error: error.code === "user_already_exists" ? "email_taken" : "signup_failed" };
  }

  // Confirmations off (local dev): session exists now, so we can link the
  // invite right away. Confirmations on (a real project's default): no
  // session yet — /auth/confirm does the linking after the user clicks
  // through, using the same team_invite_token carried in emailRedirectTo above.
  if (data.session) {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
    const { error: acceptError } = await supabase.rpc("accept_team_invite", {
      p_token: token,
      p_ip: ip,
    });
    // team_limit_reached: the team filled up (or its plan shrank) after this
    // invite was sent -- a different fix for the invitee than a dead link.
    if (acceptError) return { error: acceptError.hint === "team_limit_reached" ? "team_full" : "invalid_invite" };
    redirect(`/${locale}/dashboard`);
  }
  redirect(`/${locale}/signup/check-email`);
}
