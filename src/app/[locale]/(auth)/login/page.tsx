import type { Metadata } from "next";
import { redirectIfSignedIn } from "@/lib/auth/session";
import { LoginCard } from "./login-card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "تسجيل الدخول" : "Log in",
    description: isAr
      ? "سجّل دخولك إلى Coachlyfit لإدارة عملائك."
      : "Sign in to Coachlyfit to manage your clients.",
  };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ locale }, { error }] = await Promise.all([params, searchParams]);
  await redirectIfSignedIn(locale);

  return <LoginCard locale={locale} google={{ error }} />;
}
