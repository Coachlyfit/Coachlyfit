import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/role-home";
import { AdminSidebar } from "@/components/dashboard/admin-sidebar";
import { Topbar } from "@/components/dashboard/topbar";

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
    <div className="console flex min-h-dvh bg-background text-foreground">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <Topbar locale={locale} fullName={profile.full_name} />
        {/* Console register (design system §00/§04/§07/§08): mono-dominant,
            uppercase labels, tight radii, 40px rows. Section headings and
            table components under admin/** opt into these utilities
            directly rather than this wrapper trying to reach through. */}
        <main className="flex-1 overflow-y-auto p-4 font-mono text-sm md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
