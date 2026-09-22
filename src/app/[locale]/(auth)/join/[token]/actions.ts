"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hashInviteToken } from "@/domain/clients/invites.service";
import { joinSchema } from "./schemas";

type ActionResult = { error: string } | void;

export async function acceptInviteSignupAction(
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
      // invite_token_hash lets handle_new_user() link clients.profile_id
      // to their coach in the same transaction as the profile row — see
      // supabase/migrations/20260922000001_link_client_invite_on_signup.sql.
      // The raw invite_token in emailRedirectTo below is now belt-and-braces
      // (a fallback for pre-migration users), not load-bearing.
      data: { role: "client", full_name: fullName, locale, invite_token_hash: hashInviteToken(token) },
      emailRedirectTo: `${appUrl}/auth/confirm?next=/${locale}/c&invite_token=${token}`,
    },
  });
  if (error) {
    return { error: error.code === "user_already_exists" ? "email_taken" : "signup_failed" };
  }

  // The trigger has already linked the client by the time this runs,
  // whether or not a session exists yet.
  if (data.session) {
    redirect(`/${locale}/c`);
  }
  redirect(`/${locale}/signup/check-email`);
}
