import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/role-home";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { BottomNav } from "@/components/dashboard/bottom-nav";

export default async function CoachLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  // getUser() (not getSession()) — revalidates the JWT against the Auth
  // server rather than trusting a locally-decoded cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "coach") redirect(roleHome(locale, profile?.role));

  const { data: coach } = await supabase
    .from("coaches")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .single();
  if (!coach?.onboarding_completed_at) redirect(`/${locale}/onboarding`);

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar locale={locale} fullName={profile.full_name} />
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
          {children}
        </main>
      </div>
      <BottomNav locale={locale} />
    </div>
  );
}
