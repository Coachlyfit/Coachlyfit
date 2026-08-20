import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/role-home";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";
import { FeedbackWidget } from "@/components/dashboard/feedback-widget";

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

  const coachId = await resolveCoachId(supabase);
  if (coachId === user.id) {
    // The tenant owner -- unchanged existing gate.
    const { data: coach } = await supabase
      .from("coaches")
      .select("onboarding_completed_at")
      .eq("id", user.id)
      .single();
    if (!coach?.onboarding_completed_at) redirect(`/${locale}/onboarding`);
  }
  // Else: an accepted team member (coachId is someone else's tenant id, or
  // null). Team members never go through onboarding, so the gate simply
  // doesn't apply to them. If coachId is null here despite role === "coach"
  // that's a broken/incomplete signup state; let them through to the
  // dashboard rather than trap them in a redirect loop -- the dashboard's
  // own queries will just come back empty, which is a saner failure mode
  // than an infinite bounce.

  const impersonating = (await cookies()).get("impersonating")?.value === "1";

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        {impersonating && <ImpersonationBanner locale={locale} fullName={profile.full_name ?? ""} />}
        <Topbar locale={locale} fullName={profile.full_name} />
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
          {children}
        </main>
      </div>
      <BottomNav locale={locale} />
      <FeedbackWidget />
    </div>
  );
}
