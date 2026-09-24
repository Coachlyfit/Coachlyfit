import { redirect } from "next/navigation";
import { getAuthUser, getViewerProfile } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/role-home";
import { AdminSidebar } from "@/components/dashboard/admin-sidebar";
import { AdminTopbar } from "@/components/dashboard/admin-topbar";
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
      <PresenceHeartbeat />
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <AdminTopbar locale={locale} fullName={profile.full_name} />
        <main className="flex-1 overflow-y-auto p-4 font-mono text-sm md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
