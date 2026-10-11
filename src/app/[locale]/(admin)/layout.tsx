import { redirect } from "next/navigation";
import { getAuthUser, getViewerProfile } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/role-home";
import { AdminSidebar } from "@/components/dashboard/admin-sidebar";
import { AdminTopbar } from "@/components/dashboard/admin-topbar";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { PresenceHeartbeat } from "@/components/dashboard/presence-heartbeat";

/** Mirrors the (coach) layout — same getUser()-not-getSession() reasoning,
 * same roleHome bounce. Note this guard does NOT cover the admin server
 * actions: those are separately addressable endpoints and re-check the role
 * themselves. */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Cached via React.cache (see src/lib/auth/session.ts) so this and the
  // profile fetch run once per request and share their result with the
  // page underneath instead of both layers re-deriving them serially.
  const user = await getAuthUser();
  if (!user) redirect(`/${locale}/login`);

  const profile = await getViewerProfile();
  if (profile?.role !== "admin") redirect(roleHome(locale, profile?.role));

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <PresenceHeartbeat realtime={false} />
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar locale={locale} fullName={profile.full_name} />
        <main className="min-w-0 flex-1 p-4 pb-[calc(var(--bottom-nav-h)+1rem)] font-mono text-sm lg:p-6 lg:pb-6">
          {children}
        </main>
      </div>
      <BottomNav locale={locale} admin />
    </div>
  );
}
