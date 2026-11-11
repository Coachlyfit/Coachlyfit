import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthUser, getViewerProfile } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/role-home";
import { AdminSidebar } from "@/components/dashboard/admin-sidebar";
import { AdminTopbar } from "@/components/dashboard/admin-topbar";
import { SIDEBAR_COOKIE, collapsedFromCookie } from "@/components/dashboard/sidebar-store";
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

  const collapsed = collapsedFromCookie((await cookies()).get(SIDEBAR_COOKIE.admin)?.value, "admin");

  // L-shaped chrome: the top bar and sidebar share the navy `sidebar` surface
  // and the content sits on the page background with a rounded top-start
  // corner where the two meet.
  return (
    <div className="flex min-h-dvh flex-col bg-sidebar text-foreground">
      <PresenceHeartbeat realtime={false} />
      <AdminTopbar locale={locale} fullName={profile.full_name} userId={user.id} defaultCollapsed={collapsed} />
      <div className="flex min-w-0 flex-1">
        <AdminSidebar defaultCollapsed={collapsed} />
        <main className="min-w-0 flex-1 bg-background p-4 pb-[calc(var(--bottom-nav-h)+1rem)] font-mono text-sm lg:rounded-ss-[18px] lg:p-6 lg:pb-6">
          {children}
        </main>
      </div>
      <BottomNav locale={locale} admin />
    </div>
  );
}
