"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/role-home";
import { loginSchema, signupCoachSchema, phoneSchema, verifyOtpSchema } from "./schemas";

// redirect() throws rather than returning, so every success path ends in
// `void` here and only the failure paths produce a value.
type ActionResult = { error: string } | void;

// Onboarding step 0 collects a bare local number with a fixed +20 prefix in
// the UI (Egypt-only for now) — E.164 is built here, once, server-side.
function toE164(phone: string) {
  return `+20${phone}`;
}

export async function signInAction(
  locale: string,
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  redirect(roleHome(locale, profile?.role));
}

export async function signUpCoachAction(
  locale: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = signupCoachSchema.safeParse({
    fullName: formData.get("fullName"),
    businessName: formData.get("businessName"),
    email: formData.get("email"),
    password: formData.get("password"),
    locale,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const { fullName, businessName, email, password } = parsed.data;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role: "coach", full_name: fullName, business_name: businessName, locale },
      emailRedirectTo: `${appUrl}/auth/confirm?next=/${locale}/dashboard`,
    },
  });
  if (error) {
    return { error: error.code === "user_already_exists" ? "email_taken" : "signup_failed" };
  }

  // With email confirmations off (local dev), signUp already returns a
  // session — go straight in. With them on (a real project's default),
  // there's no session yet; the user confirms via email and lands on
  // /auth/confirm, which is what actually redirects them in that case.
  if (data.session) {
    redirect(roleHome(locale, "coach"));
  }
  redirect(`/${locale}/signup/check-email`);
}

/** Step 0 of onboarding: send a WhatsApp OTP to a new or returning coach.
 * signInWithOtp both signs up and signs in — there's no separate "does this
 * phone exist" check, matching the design's single phone-number screen. */
export async function sendOtpAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = phoneSchema.safeParse({
    phone: formData.get("phone"),
    locale,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: toE164(parsed.data.phone),
    options: {
      channel: "whatsapp",
      data: { role: "coach", locale: parsed.data.locale },
    },
  });
  if (error) return { error: "otp_send_failed" };
}

export async function verifyOtpAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = verifyOtpSchema.safeParse({
    phone: formData.get("phone"),
    token: formData.get("token"),
    locale,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    phone: toE164(parsed.data.phone),
    token: parsed.data.token,
    type: "sms",
  });
  if (error || !data.user) return { error: "otp_invalid" };

  redirect(roleHome(locale, "coach"));
}
