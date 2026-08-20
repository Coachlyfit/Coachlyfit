import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/role-home";

// Deliberately its own route group, not nested under (coach): the (coach)
// layout redirects here whenever onboarding isn't finished, and this layout
// redirects to the dashboard once it is — keeping those two guards in
// separate layouts means neither can loop into the other.
export default async function OnboardingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "coach") redirect(roleHome(locale, profile?.role));

  const { data: coach } = await supabase
    .from("coaches")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .single();
  if (coach?.onboarding_completed_at) redirect(`/${locale}/dashboard`);

  return <div className="mx-auto min-h-dvh w-full max-w-2xl p-4 py-8 md:p-8">{children}</div>;
}
