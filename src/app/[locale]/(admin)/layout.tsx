import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

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
